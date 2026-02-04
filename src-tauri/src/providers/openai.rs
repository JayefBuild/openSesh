//! OpenAI API Provider
//!
//! This module implements the Provider trait for OpenAI's Chat Completions API,
//! supporting both synchronous and streaming chat completions with tool/function calling.

use async_trait::async_trait;
use futures::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use super::{
    ChatChunk, ChatMessage, ChatResponse, ContentBlock, ContentDelta,
    Provider, ProviderError, Role, StopReason, Tool, Usage,
};

const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4o";
const DEFAULT_MAX_TOKENS: u32 = 4096;
const DEFAULT_TEMPERATURE: f32 = 0.7;

/// OpenAI API request body
#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream_options: Option<StreamOptions>,
}

#[derive(Debug, Serialize)]
struct StreamOptions {
    include_usage: bool,
}

/// OpenAI message format
#[derive(Debug, Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OpenAIContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

/// OpenAI content - can be string or array of parts
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum OpenAIContent {
    Text(String),
    Parts(Vec<OpenAIContentPart>),
}

/// OpenAI content part for multi-modal messages
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OpenAIContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAIImageUrl },
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIImageUrl {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

/// OpenAI tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
}

/// OpenAI tool definition
#[derive(Debug, Serialize)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunctionDef,
}

#[derive(Debug, Serialize)]
struct OpenAIFunctionDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

/// OpenAI API response
#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    id: String,
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
    model: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
    finish_reason: Option<String>,
    index: usize,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIResponseMessage {
    role: String,
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIToolCall>>,
}

/// OpenAI usage stats
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

/// OpenAI error response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIError {
    error: OpenAIErrorDetail,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIErrorDetail {
    message: String,
    #[serde(rename = "type")]
    error_type: String,
    code: Option<String>,
}

/// OpenAI streaming response chunk
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIStreamChunk {
    id: String,
    choices: Vec<OpenAIStreamChoice>,
    model: String,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIStreamChoice {
    index: usize,
    delta: OpenAIStreamDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIStreamDelta {
    role: Option<String>,
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIStreamToolCall {
    index: usize,
    id: Option<String>,
    #[serde(rename = "type")]
    call_type: Option<String>,
    function: Option<OpenAIStreamFunction>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

/// OpenAI Chat Completions API provider
pub struct OpenAIProvider {
    client: Client,
    api_key: String,
    model: String,
    system_prompt: Option<String>,
    max_tokens: u32,
    temperature: f32,
    base_url: String,
}

impl OpenAIProvider {
    /// Create a new OpenAI provider with the given API key
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: DEFAULT_MODEL.to_string(),
            system_prompt: None,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: DEFAULT_TEMPERATURE,
            base_url: OPENAI_API_URL.to_string(),
        }
    }

    /// Create a new OpenAI provider with a custom base URL (for OpenAI-compatible APIs)
    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: DEFAULT_MODEL.to_string(),
            system_prompt: None,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: DEFAULT_TEMPERATURE,
            base_url,
        }
    }

    /// Convert internal messages to OpenAI format
    fn convert_messages(&self, messages: &[ChatMessage]) -> Vec<OpenAIMessage> {
        let mut result = Vec::new();

        // Add system prompt if configured
        if let Some(system) = &self.system_prompt {
            result.push(OpenAIMessage {
                role: "system".to_string(),
                content: Some(OpenAIContent::Text(system.clone())),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            });
        }

        for msg in messages {
            match msg.role {
                Role::System => {
                    // Skip if we already added a system prompt
                    if self.system_prompt.is_none() {
                        let content = match &msg.content {
                            super::types::MessageContent::Text { content } => content.clone(),
                            super::types::MessageContent::Blocks { content } => content
                                .iter()
                                .filter_map(|b| match b {
                                    ContentBlock::Text { text } => Some(text.as_str()),
                                    _ => None,
                                })
                                .collect::<Vec<_>>()
                                .join(""),
                        };
                        result.push(OpenAIMessage {
                            role: "system".to_string(),
                            content: Some(OpenAIContent::Text(content)),
                            tool_calls: None,
                            tool_call_id: None,
                            name: None,
                        });
                    }
                }
                Role::User => {
                    let content = match &msg.content {
                        super::types::MessageContent::Text { content } => {
                            OpenAIContent::Text(content.clone())
                        }
                        super::types::MessageContent::Blocks { content } => {
                            // Check if there are any tool results
                            let tool_results: Vec<_> = content
                                .iter()
                                .filter_map(|b| match b {
                                    ContentBlock::ToolResult {
                                        tool_use_id,
                                        content,
                                        is_error,
                                    } => Some((tool_use_id, content, is_error)),
                                    _ => None,
                                })
                                .collect();

                            if !tool_results.is_empty() {
                                // Add tool result messages
                                for (tool_use_id, content, _is_error) in tool_results {
                                    result.push(OpenAIMessage {
                                        role: "tool".to_string(),
                                        content: Some(OpenAIContent::Text(content.clone())),
                                        tool_calls: None,
                                        tool_call_id: Some(tool_use_id.clone()),
                                        name: None,
                                    });
                                }
                                continue; // Skip adding the user message
                            }

                            // Convert other content blocks
                            let parts: Vec<_> = content
                                .iter()
                                .filter_map(|b| match b {
                                    ContentBlock::Text { text } => {
                                        Some(OpenAIContentPart::Text { text: text.clone() })
                                    }
                                    ContentBlock::Image { source } => match source {
                                        super::types::ImageSource::Base64 { media_type, data } => {
                                            Some(OpenAIContentPart::ImageUrl {
                                                image_url: OpenAIImageUrl {
                                                    url: format!(
                                                        "data:{};base64,{}",
                                                        media_type, data
                                                    ),
                                                    detail: None,
                                                },
                                            })
                                        }
                                        super::types::ImageSource::Url { url } => {
                                            Some(OpenAIContentPart::ImageUrl {
                                                image_url: OpenAIImageUrl {
                                                    url: url.clone(),
                                                    detail: None,
                                                },
                                            })
                                        }
                                    },
                                    _ => None,
                                })
                                .collect();

                            if parts.len() == 1 {
                                if let OpenAIContentPart::Text { text } = &parts[0] {
                                    OpenAIContent::Text(text.clone())
                                } else {
                                    OpenAIContent::Parts(parts)
                                }
                            } else {
                                OpenAIContent::Parts(parts)
                            }
                        }
                    };

                    result.push(OpenAIMessage {
                        role: "user".to_string(),
                        content: Some(content),
                        tool_calls: None,
                        tool_call_id: None,
                        name: None,
                    });
                }
                Role::Assistant => {
                    match &msg.content {
                        super::types::MessageContent::Text { content } => {
                            result.push(OpenAIMessage {
                                role: "assistant".to_string(),
                                content: Some(OpenAIContent::Text(content.clone())),
                                tool_calls: None,
                                tool_call_id: None,
                                name: None,
                            });
                        }
                        super::types::MessageContent::Blocks { content } => {
                            // Extract text and tool calls
                            let text: String = content
                                .iter()
                                .filter_map(|b| match b {
                                    ContentBlock::Text { text } => Some(text.as_str()),
                                    _ => None,
                                })
                                .collect::<Vec<_>>()
                                .join("");

                            let tool_calls: Vec<_> = content
                                .iter()
                                .filter_map(|b| match b {
                                    ContentBlock::ToolUse { id, name, input } => {
                                        Some(OpenAIToolCall {
                                            id: id.clone(),
                                            call_type: "function".to_string(),
                                            function: OpenAIFunctionCall {
                                                name: name.clone(),
                                                arguments: serde_json::to_string(input)
                                                    .unwrap_or_default(),
                                            },
                                        })
                                    }
                                    _ => None,
                                })
                                .collect();

                            result.push(OpenAIMessage {
                                role: "assistant".to_string(),
                                content: if text.is_empty() {
                                    None
                                } else {
                                    Some(OpenAIContent::Text(text))
                                },
                                tool_calls: if tool_calls.is_empty() {
                                    None
                                } else {
                                    Some(tool_calls)
                                },
                                tool_call_id: None,
                                name: None,
                            });
                        }
                    }
                }
                Role::Tool => {
                    // Tool messages are handled in User branch
                }
            }
        }

        result
    }

    /// Convert tools to OpenAI format
    fn convert_tools(&self, tools: &[Tool]) -> Vec<OpenAITool> {
        tools
            .iter()
            .map(|t| OpenAITool {
                tool_type: "function".to_string(),
                function: OpenAIFunctionDef {
                    name: t.name.clone(),
                    description: t.description.clone(),
                    parameters: t.input_schema.clone(),
                },
            })
            .collect()
    }

    /// Convert OpenAI response to internal format
    fn convert_response(&self, response: OpenAIResponse) -> ChatResponse {
        let choice = response.choices.first();
        let message = choice.map(|c| &c.message);
        let finish_reason = choice.and_then(|c| c.finish_reason.as_ref());

        let mut content = Vec::new();

        if let Some(msg) = message {
            // Add text content
            if let Some(text) = &msg.content {
                if !text.is_empty() {
                    content.push(ContentBlock::Text { text: text.clone() });
                }
            }

            // Add tool calls
            if let Some(tool_calls) = &msg.tool_calls {
                for tc in tool_calls {
                    let arguments: serde_json::Value =
                        serde_json::from_str(&tc.function.arguments).unwrap_or_default();
                    content.push(ContentBlock::ToolUse {
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        input: arguments,
                    });
                }
            }
        }

        let stop_reason = finish_reason.map(|r| match r.as_str() {
            "stop" => StopReason::EndTurn,
            "length" => StopReason::MaxTokens,
            "tool_calls" => StopReason::ToolUse,
            _ => StopReason::EndTurn,
        });

        let usage = response.usage.map(|u| Usage {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
        }).unwrap_or_default();

        ChatResponse {
            id: response.id,
            content,
            stop_reason,
            usage,
            model: response.model,
        }
    }
}

#[async_trait]
impl Provider for OpenAIProvider {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<ChatResponse, ProviderError> {
        let request = OpenAIRequest {
            model: self.model.clone(),
            messages: self.convert_messages(&messages),
            max_tokens: Some(self.max_tokens),
            temperature: Some(self.temperature),
            tools: tools.map(|t| self.convert_tools(&t)),
            stream: false,
            stream_options: None,
        };

        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<OpenAIError>(&error_text) {
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

        let openai_response: OpenAIResponse = response.json().await?;
        Ok(self.convert_response(openai_response))
    }

    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatChunk, ProviderError>> + Send>>, ProviderError>
    {
        let request = OpenAIRequest {
            model: self.model.clone(),
            messages: self.convert_messages(&messages),
            max_tokens: Some(self.max_tokens),
            temperature: Some(self.temperature),
            tools: tools.map(|t| self.convert_tools(&t)),
            stream: true,
            stream_options: Some(StreamOptions { include_usage: true }),
        };

        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<OpenAIError>(&error_text) {
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

        // Track state for converting OpenAI stream to our format
        let byte_stream = response.bytes_stream();
        let model_clone = self.model.clone();

        let stream = byte_stream
            .map(move |result| {
                let model = model_clone.clone();
                result
                    .map_err(|e| ProviderError::StreamError(e.to_string()))
                    .and_then(move |bytes| {
                        let text = String::from_utf8_lossy(&bytes);
                        let mut chunks = Vec::new();

                        for line in text.lines() {
                            if let Some(data) = line.strip_prefix("data: ") {
                                if data == "[DONE]" {
                                    chunks.push(Ok(ChatChunk::MessageStop));
                                    continue;
                                }

                                if let Ok(chunk) = serde_json::from_str::<OpenAIStreamChunk>(data) {
                                    // First chunk - message start
                                    if chunks.is_empty() {
                                        chunks.push(Ok(ChatChunk::MessageStart {
                                            id: chunk.id.clone(),
                                            model: model.clone(),
                                        }));
                                    }

                                    for choice in &chunk.choices {
                                        // Handle text content
                                        if let Some(content) = &choice.delta.content {
                                            if !content.is_empty() {
                                                chunks.push(Ok(ChatChunk::ContentBlockDelta {
                                                    index: 0,
                                                    delta: ContentDelta::TextDelta {
                                                        text: content.clone(),
                                                    },
                                                }));
                                            }
                                        }

                                        // Handle tool calls
                                        if let Some(tool_calls) = &choice.delta.tool_calls {
                                            for tc in tool_calls {
                                                if let Some(id) = &tc.id {
                                                    // New tool call starting
                                                    let name = tc
                                                        .function
                                                        .as_ref()
                                                        .and_then(|f| f.name.clone())
                                                        .unwrap_or_default();
                                                    chunks.push(Ok(ChatChunk::ContentBlockStart {
                                                        index: tc.index + 1, // Offset by 1 for text block
                                                        content_block: ContentBlock::ToolUse {
                                                            id: id.clone(),
                                                            name,
                                                            input: serde_json::Value::Object(
                                                                Default::default(),
                                                            ),
                                                        },
                                                    }));
                                                }

                                                // Tool call arguments delta
                                                if let Some(func) = &tc.function {
                                                    if let Some(args) = &func.arguments {
                                                        if !args.is_empty() {
                                                            chunks.push(Ok(
                                                                ChatChunk::ContentBlockDelta {
                                                                    index: tc.index + 1,
                                                                    delta:
                                                                        ContentDelta::InputJsonDelta {
                                                                            partial_json: args
                                                                                .clone(),
                                                                        },
                                                                },
                                                            ));
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // Handle finish reason
                                        if let Some(finish_reason) = &choice.finish_reason {
                                            let stop_reason = match finish_reason.as_str() {
                                                "stop" => Some(StopReason::EndTurn),
                                                "length" => Some(StopReason::MaxTokens),
                                                "tool_calls" => Some(StopReason::ToolUse),
                                                _ => None,
                                            };

                                            chunks.push(Ok(ChatChunk::MessageDelta {
                                                stop_reason,
                                                usage: chunk.usage.as_ref().map(|u| Usage {
                                                    input_tokens: u.prompt_tokens,
                                                    output_tokens: u.completion_tokens,
                                                }),
                                            }));
                                        }
                                    }
                                }
                            }
                        }

                        Ok(chunks)
                    })
            })
            .filter_map(|result| async move {
                match result {
                    Ok(chunks) => Some(futures::stream::iter(chunks)),
                    Err(e) => Some(futures::stream::iter(vec![Err(e)])),
                }
            })
            .flatten();

        Ok(Box::pin(stream))
    }

    fn name(&self) -> &str {
        "openai"
    }

    fn supports_tools(&self) -> bool {
        true
    }

    fn default_model(&self) -> &str {
        DEFAULT_MODEL
    }

    fn available_models(&self) -> Vec<&str> {
        vec![
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo",
            "o1-preview",
            "o1-mini",
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
        self.temperature = temperature.clamp(0.0, 2.0);
    }

    fn temperature(&self) -> f32 {
        self.temperature
    }
}
