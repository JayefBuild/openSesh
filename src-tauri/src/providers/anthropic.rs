//! Anthropic Claude API Provider
//!
//! This module implements the Provider trait for Anthropic's Claude API,
//! supporting both synchronous and streaming chat completions with tool use.

use async_trait::async_trait;
use futures::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use super::{
    ChatChunk, ChatMessage, ChatResponse, ContentBlock, ContentDelta,
    Provider, ProviderError, Role, StopReason, Tool, Usage,
};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS: u32 = 4096;
const DEFAULT_TEMPERATURE: f32 = 0.7;

/// Anthropic API request body
#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

/// Anthropic message format
#[derive(Debug, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

/// Anthropic content - can be string or array of blocks
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

/// Anthropic content block
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentBlock {
    Text {
        text: String,
    },
    Image {
        source: AnthropicImageSource,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
}

/// Anthropic image source
#[derive(Debug, Serialize, Deserialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

/// Anthropic tool definition
#[derive(Debug, Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

/// Anthropic API response
#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    id: String,
    content: Vec<AnthropicContentBlock>,
    stop_reason: Option<String>,
    usage: AnthropicUsage,
    model: String,
}

/// Anthropic usage stats
#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

/// Anthropic error response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AnthropicError {
    #[serde(rename = "type")]
    error_type: String,
    error: AnthropicErrorDetail,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

/// Anthropic SSE event types
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicStreamEvent {
    MessageStart {
        message: AnthropicStreamMessage,
    },
    ContentBlockStart {
        index: usize,
        content_block: AnthropicContentBlock,
    },
    ContentBlockDelta {
        index: usize,
        delta: AnthropicDelta,
    },
    ContentBlockStop {
        index: usize,
    },
    MessageDelta {
        delta: AnthropicMessageDelta,
        usage: Option<AnthropicUsage>,
    },
    MessageStop,
    Ping,
    Error {
        error: AnthropicErrorDetail,
    },
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamMessage {
    id: String,
    model: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicDelta {
    TextDelta { text: String },
    InputJsonDelta { partial_json: String },
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageDelta {
    stop_reason: Option<String>,
}

/// Anthropic Claude API provider
pub struct AnthropicProvider {
    client: Client,
    api_key: String,
    model: String,
    system_prompt: Option<String>,
    max_tokens: u32,
    temperature: f32,
}

impl AnthropicProvider {
    /// Create a new Anthropic provider with the given API key
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: DEFAULT_MODEL.to_string(),
            system_prompt: None,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: DEFAULT_TEMPERATURE,
        }
    }

    /// Convert internal messages to Anthropic format
    fn convert_messages(&self, messages: &[ChatMessage]) -> Vec<AnthropicMessage> {
        messages
            .iter()
            .filter(|m| m.role != Role::System) // System messages handled separately
            .map(|m| {
                let role = match m.role {
                    Role::User | Role::Tool => "user",
                    Role::Assistant => "assistant",
                    Role::System => "user", // Shouldn't happen due to filter
                };

                let content = match &m.content {
                    super::types::MessageContent::Text { content } => {
                        AnthropicContent::Text(content.clone())
                    }
                    super::types::MessageContent::Blocks { content } => {
                        AnthropicContent::Blocks(
                            content
                                .iter()
                                .map(|b| match b {
                                    ContentBlock::Text { text } => {
                                        AnthropicContentBlock::Text { text: text.clone() }
                                    }
                                    ContentBlock::Image { source } => {
                                        match source {
                                            super::types::ImageSource::Base64 { media_type, data } => {
                                                AnthropicContentBlock::Image {
                                                    source: AnthropicImageSource {
                                                        source_type: "base64".to_string(),
                                                        media_type: media_type.clone(),
                                                        data: data.clone(),
                                                    },
                                                }
                                            }
                                            super::types::ImageSource::Url { url } => {
                                                // Anthropic doesn't support URL images directly,
                                                // would need to fetch and convert
                                                AnthropicContentBlock::Text {
                                                    text: format!("[Image URL: {}]", url),
                                                }
                                            }
                                        }
                                    }
                                    ContentBlock::ToolUse { id, name, input } => {
                                        AnthropicContentBlock::ToolUse {
                                            id: id.clone(),
                                            name: name.clone(),
                                            input: input.clone(),
                                        }
                                    }
                                    ContentBlock::ToolResult {
                                        tool_use_id,
                                        content,
                                        is_error,
                                    } => AnthropicContentBlock::ToolResult {
                                        tool_use_id: tool_use_id.clone(),
                                        content: content.clone(),
                                        is_error: *is_error,
                                    },
                                })
                                .collect(),
                        )
                    }
                };

                AnthropicMessage {
                    role: role.to_string(),
                    content,
                }
            })
            .collect()
    }

    /// Extract system prompt from messages
    fn extract_system_prompt(&self, messages: &[ChatMessage]) -> Option<String> {
        // First check if we have a configured system prompt
        if let Some(prompt) = &self.system_prompt {
            return Some(prompt.clone());
        }

        // Otherwise, look for a system message in the conversation
        messages
            .iter()
            .find(|m| m.role == Role::System)
            .map(|m| match &m.content {
                super::types::MessageContent::Text { content } => content.clone(),
                super::types::MessageContent::Blocks { content } => content
                    .iter()
                    .filter_map(|b| match b {
                        ContentBlock::Text { text } => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join(""),
            })
    }

    /// Convert tools to Anthropic format
    fn convert_tools(&self, tools: &[Tool]) -> Vec<AnthropicTool> {
        tools
            .iter()
            .map(|t| AnthropicTool {
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
            })
            .collect()
    }

    /// Convert Anthropic response to internal format
    fn convert_response(&self, response: AnthropicResponse) -> ChatResponse {
        ChatResponse {
            id: response.id,
            content: response
                .content
                .into_iter()
                .map(|b| match b {
                    AnthropicContentBlock::Text { text } => ContentBlock::Text { text },
                    AnthropicContentBlock::Image { source } => ContentBlock::Image {
                        source: super::types::ImageSource::Base64 {
                            media_type: source.media_type,
                            data: source.data,
                        },
                    },
                    AnthropicContentBlock::ToolUse { id, name, input } => {
                        ContentBlock::ToolUse { id, name, input }
                    }
                    AnthropicContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    } => ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    },
                })
                .collect(),
            stop_reason: response.stop_reason.map(|r| match r.as_str() {
                "end_turn" => StopReason::EndTurn,
                "max_tokens" => StopReason::MaxTokens,
                "stop_sequence" => StopReason::StopSequence,
                "tool_use" => StopReason::ToolUse,
                _ => StopReason::EndTurn,
            }),
            usage: Usage {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
            },
            model: response.model,
        }
    }

    /// Parse SSE data line into event
    #[allow(dead_code)]
    fn parse_sse_event(&self, data: &str) -> Option<AnthropicStreamEvent> {
        serde_json::from_str(data).ok()
    }

    /// Convert Anthropic stream event to internal chunk format
    #[allow(dead_code)]
    fn convert_stream_event(&self, event: AnthropicStreamEvent) -> ChatChunk {
        match event {
            AnthropicStreamEvent::MessageStart { message } => ChatChunk::MessageStart {
                id: message.id,
                model: message.model,
            },
            AnthropicStreamEvent::ContentBlockStart {
                index,
                content_block,
            } => {
                let block = match content_block {
                    AnthropicContentBlock::Text { text } => ContentBlock::Text { text },
                    AnthropicContentBlock::ToolUse { id, name, input } => {
                        ContentBlock::ToolUse { id, name, input }
                    }
                    AnthropicContentBlock::Image { source } => ContentBlock::Image {
                        source: super::types::ImageSource::Base64 {
                            media_type: source.media_type,
                            data: source.data,
                        },
                    },
                    AnthropicContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    } => ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    },
                };
                ChatChunk::ContentBlockStart {
                    index,
                    content_block: block,
                }
            }
            AnthropicStreamEvent::ContentBlockDelta { index, delta } => {
                let delta = match delta {
                    AnthropicDelta::TextDelta { text } => ContentDelta::TextDelta { text },
                    AnthropicDelta::InputJsonDelta { partial_json } => {
                        ContentDelta::InputJsonDelta { partial_json }
                    }
                };
                ChatChunk::ContentBlockDelta { index, delta }
            }
            AnthropicStreamEvent::ContentBlockStop { index } => {
                ChatChunk::ContentBlockStop { index }
            }
            AnthropicStreamEvent::MessageDelta { delta, usage } => ChatChunk::MessageDelta {
                stop_reason: delta.stop_reason.map(|r| match r.as_str() {
                    "end_turn" => StopReason::EndTurn,
                    "max_tokens" => StopReason::MaxTokens,
                    "stop_sequence" => StopReason::StopSequence,
                    "tool_use" => StopReason::ToolUse,
                    _ => StopReason::EndTurn,
                }),
                usage: usage.map(|u| Usage {
                    input_tokens: u.input_tokens,
                    output_tokens: u.output_tokens,
                }),
            },
            AnthropicStreamEvent::MessageStop => ChatChunk::MessageStop,
            AnthropicStreamEvent::Ping => ChatChunk::Ping,
            AnthropicStreamEvent::Error { error } => ChatChunk::Error {
                message: error.message,
            },
        }
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<ChatResponse, ProviderError> {
        let request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: self.max_tokens,
            messages: self.convert_messages(&messages),
            system: self.extract_system_prompt(&messages),
            tools: tools.map(|t| self.convert_tools(&t)),
            temperature: Some(self.temperature),
            stream: false,
        };

        let response = self
            .client
            .post(ANTHROPIC_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<AnthropicError>(&error_text) {
                if status.as_u16() == 429 {
                    return Err(ProviderError::RateLimited { retry_after: None });
                }
                return Err(ProviderError::ApiError {
                    status: status.as_u16(),
                    message: error.error.message,
                });
            }
            return Err(ProviderError::ApiError {
                status: status.as_u16(),
                message: error_text,
            });
        }

        let anthropic_response: AnthropicResponse = response.json().await?;
        Ok(self.convert_response(anthropic_response))
    }

    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatChunk, ProviderError>> + Send>>, ProviderError>
    {
        let request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: self.max_tokens,
            messages: self.convert_messages(&messages),
            system: self.extract_system_prompt(&messages),
            tools: tools.map(|t| self.convert_tools(&t)),
            temperature: Some(self.temperature),
            stream: true,
        };

        let response = self
            .client
            .post(ANTHROPIC_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<AnthropicError>(&error_text) {
                if status.as_u16() == 429 {
                    return Err(ProviderError::RateLimited { retry_after: None });
                }
                return Err(ProviderError::ApiError {
                    status: status.as_u16(),
                    message: error.error.message,
                });
            }
            return Err(ProviderError::ApiError {
                status: status.as_u16(),
                message: error_text,
            });
        }

        // Parse SSE stream
        let byte_stream = response.bytes_stream();

        let stream = byte_stream
            .map(move |result| {
                result
                    .map_err(|e| ProviderError::StreamError(e.to_string()))
                    .and_then(|bytes| {
                        let text = String::from_utf8_lossy(&bytes);
                        Ok(text.to_string())
                    })
            })
            .filter_map(|result| async move {
                match result {
                    Ok(text) => {
                        // Parse SSE events from the text
                        let mut chunks = Vec::new();
                        for line in text.lines() {
                            if let Some(data) = line.strip_prefix("data: ") {
                                if data == "[DONE]" {
                                    continue;
                                }
                                if let Ok(event) =
                                    serde_json::from_str::<AnthropicStreamEvent>(data)
                                {
                                    let chunk = match event {
                                        AnthropicStreamEvent::MessageStart { message } => {
                                            ChatChunk::MessageStart {
                                                id: message.id,
                                                model: message.model,
                                            }
                                        }
                                        AnthropicStreamEvent::ContentBlockStart {
                                            index,
                                            content_block,
                                        } => {
                                            let block = match content_block {
                                                AnthropicContentBlock::Text { text } => {
                                                    ContentBlock::Text { text }
                                                }
                                                AnthropicContentBlock::ToolUse { id, name, input } => {
                                                    ContentBlock::ToolUse { id, name, input }
                                                }
                                                AnthropicContentBlock::Image { source } => {
                                                    ContentBlock::Image {
                                                        source: super::types::ImageSource::Base64 {
                                                            media_type: source.media_type,
                                                            data: source.data,
                                                        },
                                                    }
                                                }
                                                AnthropicContentBlock::ToolResult {
                                                    tool_use_id,
                                                    content,
                                                    is_error,
                                                } => ContentBlock::ToolResult {
                                                    tool_use_id,
                                                    content,
                                                    is_error,
                                                },
                                            };
                                            ChatChunk::ContentBlockStart {
                                                index,
                                                content_block: block,
                                            }
                                        }
                                        AnthropicStreamEvent::ContentBlockDelta { index, delta } => {
                                            let delta = match delta {
                                                AnthropicDelta::TextDelta { text } => {
                                                    ContentDelta::TextDelta { text }
                                                }
                                                AnthropicDelta::InputJsonDelta { partial_json } => {
                                                    ContentDelta::InputJsonDelta { partial_json }
                                                }
                                            };
                                            ChatChunk::ContentBlockDelta { index, delta }
                                        }
                                        AnthropicStreamEvent::ContentBlockStop { index } => {
                                            ChatChunk::ContentBlockStop { index }
                                        }
                                        AnthropicStreamEvent::MessageDelta { delta, usage } => {
                                            ChatChunk::MessageDelta {
                                                stop_reason: delta.stop_reason.map(|r| {
                                                    match r.as_str() {
                                                        "end_turn" => StopReason::EndTurn,
                                                        "max_tokens" => StopReason::MaxTokens,
                                                        "stop_sequence" => StopReason::StopSequence,
                                                        "tool_use" => StopReason::ToolUse,
                                                        _ => StopReason::EndTurn,
                                                    }
                                                }),
                                                usage: usage.map(|u| Usage {
                                                    input_tokens: u.input_tokens,
                                                    output_tokens: u.output_tokens,
                                                }),
                                            }
                                        }
                                        AnthropicStreamEvent::MessageStop => ChatChunk::MessageStop,
                                        AnthropicStreamEvent::Ping => ChatChunk::Ping,
                                        AnthropicStreamEvent::Error { error } => ChatChunk::Error {
                                            message: error.message,
                                        },
                                    };
                                    chunks.push(Ok(chunk));
                                }
                            }
                        }
                        Some(futures::stream::iter(chunks))
                    }
                    Err(e) => Some(futures::stream::iter(vec![Err(e)])),
                }
            })
            .flatten();

        Ok(Box::pin(stream))
    }

    fn name(&self) -> &str {
        "anthropic"
    }

    fn supports_tools(&self) -> bool {
        true
    }

    fn default_model(&self) -> &str {
        DEFAULT_MODEL
    }

    fn available_models(&self) -> Vec<&str> {
        vec![
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
        ]
    }

    fn set_model(&mut self, model: &str) {
        self.model = model.to_string();
    }

    fn model(&self) -> &str {
        &self.model
    }

    fn set_system_prompt(&mut self, prompt: Option<String>) {
        self.system_prompt = prompt;
    }

    fn system_prompt(&self) -> Option<&str> {
        self.system_prompt.as_deref()
    }

    fn set_max_tokens(&mut self, max_tokens: u32) {
        self.max_tokens = max_tokens;
    }

    fn max_tokens(&self) -> u32 {
        self.max_tokens
    }

    fn set_temperature(&mut self, temperature: f32) {
        self.temperature = temperature.clamp(0.0, 1.0);
    }

    fn temperature(&self) -> f32 {
        self.temperature
    }
}
