//! Chat commands for AI interactions
//!
//! This module provides Tauri commands for sending messages to AI providers
//! and handling streaming responses.

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use futures::StreamExt;

use crate::providers::{ChatChunk, ChatMessage, ChatResponse, ContentBlock, Role, Tool};
use crate::state::AppState;
use crate::tools::{execute_tool_as_string, get_tool_definitions, tool_result_is_error};

/// Request payload for sending a chat message
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub messages: Vec<ChatMessageInput>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub enable_tools: bool,
    #[serde(default)]
    pub stream: bool,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// Input message format from frontend
#[derive(Debug, Deserialize)]
pub struct ChatMessageInput {
    pub role: String,
    pub content: String,
}

impl From<ChatMessageInput> for ChatMessage {
    fn from(input: ChatMessageInput) -> Self {
        let role = match input.role.as_str() {
            "system" => Role::System,
            "user" => Role::User,
            "assistant" => Role::Assistant,
            "tool" => Role::Tool,
            _ => Role::User,
        };
        ChatMessage::text(role, input.content)
    }
}

/// Response from chat command
#[derive(Debug, Serialize)]
pub struct ChatResponseOutput {
    pub id: String,
    pub content: String,
    pub tool_calls: Vec<ToolCallOutput>,
    pub stop_reason: Option<String>,
    pub usage: UsageOutput,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallOutput {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct UsageOutput {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl From<ChatResponse> for ChatResponseOutput {
    fn from(response: ChatResponse) -> Self {
        let content = response.text();
        let tool_calls = response
            .tool_calls()
            .into_iter()
            .map(|tc| ToolCallOutput {
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
            })
            .collect();

        ChatResponseOutput {
            id: response.id,
            content,
            tool_calls,
            stop_reason: response.stop_reason.map(|r| format!("{:?}", r)),
            usage: UsageOutput {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
            },
            model: response.model,
        }
    }
}

/// Send a message to the AI provider (non-streaming)
#[tauri::command]
pub async fn send_message(
    state: State<'_, Arc<AppState>>,
    request: SendMessageRequest,
) -> Result<ChatResponseOutput, String> {
    // Get the provider
    let provider = if let Some(provider_name) = &request.provider {
        state.get_provider(provider_name).await
    } else {
        state.get_active_provider().await
    };

    let provider = provider.ok_or_else(|| "No AI provider configured".to_string())?;

    // Convert messages
    let mut messages: Vec<ChatMessage> = request.messages.into_iter().map(|m| m.into()).collect();

    // Add system prompt if provided
    if let Some(system) = request.system_prompt {
        messages.insert(0, ChatMessage::system(system));
    }

    // Get tools if enabled
    let tools = if request.enable_tools {
        let tool_defs = get_tool_definitions();
        Some(
            tool_defs
                .into_iter()
                .map(|td| Tool::new(td.name, td.description, td.parameters))
                .collect(),
        )
    } else {
        None
    };

    // Send request
    let response = provider
        .chat(messages, tools)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.into())
}

/// Send a message with streaming response
#[tauri::command]
pub async fn send_message_stream(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    request: SendMessageRequest,
    stream_id: String,
) -> Result<(), String> {
    // Get the provider
    let provider = if let Some(provider_name) = &request.provider {
        state.get_provider(provider_name).await
    } else {
        state.get_active_provider().await
    };

    let provider = provider.ok_or_else(|| "No AI provider configured".to_string())?;

    // Convert messages
    let mut messages: Vec<ChatMessage> = request.messages.into_iter().map(|m| m.into()).collect();

    // Add system prompt if provided
    if let Some(system) = request.system_prompt {
        messages.insert(0, ChatMessage::system(system));
    }

    // Get tools if enabled
    let tools = if request.enable_tools {
        let tool_defs = get_tool_definitions();
        Some(
            tool_defs
                .into_iter()
                .map(|td| Tool::new(td.name, td.description, td.parameters))
                .collect(),
        )
    } else {
        None
    };

    // Start streaming
    let mut stream = provider
        .chat_stream(messages, tools)
        .await
        .map_err(|e| e.to_string())?;

    // Process stream and emit events
    let event_name = format!("chat-stream-{}", stream_id);

    while let Some(result) = stream.next().await {
        match result {
            Ok(chunk) => {
                let event = StreamEvent::from_chunk(chunk);
                if app.emit(&event_name, &event).is_err() {
                    break;
                }
            }
            Err(e) => {
                let event = StreamEvent::Error {
                    message: e.to_string(),
                };
                let _ = app.emit(&event_name, &event);
                break;
            }
        }
    }

    // Send completion event
    let _ = app.emit(&event_name, &StreamEvent::Done);

    Ok(())
}

/// Stream event sent to frontend
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    MessageStart { id: String, model: String },
    ContentBlockStart { index: usize, block_type: String },
    TextDelta { index: usize, text: String },
    ToolUseDelta { index: usize, partial_json: String },
    ContentBlockStop { index: usize },
    MessageDelta { stop_reason: Option<String> },
    Error { message: String },
    Done,
}

impl StreamEvent {
    fn from_chunk(chunk: ChatChunk) -> Self {
        match chunk {
            ChatChunk::MessageStart { id, model } => StreamEvent::MessageStart { id, model },
            ChatChunk::ContentBlockStart { index, content_block } => {
                let block_type = match content_block {
                    ContentBlock::Text { .. } => "text",
                    ContentBlock::ToolUse { .. } => "tool_use",
                    ContentBlock::Image { .. } => "image",
                    ContentBlock::ToolResult { .. } => "tool_result",
                };
                StreamEvent::ContentBlockStart {
                    index,
                    block_type: block_type.to_string(),
                }
            }
            ChatChunk::ContentBlockDelta { index, delta } => match delta {
                crate::providers::ContentDelta::TextDelta { text } => {
                    StreamEvent::TextDelta { index, text }
                }
                crate::providers::ContentDelta::InputJsonDelta { partial_json } => {
                    StreamEvent::ToolUseDelta { index, partial_json }
                }
            },
            ChatChunk::ContentBlockStop { index } => StreamEvent::ContentBlockStop { index },
            ChatChunk::MessageDelta { stop_reason, .. } => StreamEvent::MessageDelta {
                stop_reason: stop_reason.map(|r| format!("{:?}", r)),
            },
            ChatChunk::MessageStop => StreamEvent::Done,
            ChatChunk::Error { message } => StreamEvent::Error { message },
            ChatChunk::Ping => StreamEvent::Done, // Ignore pings
        }
    }
}

/// Execute tool calls from an AI response
#[tauri::command]
pub async fn execute_tool_calls(
    tool_calls: Vec<ToolCallOutput>,
) -> Result<Vec<ToolResultOutput>, String> {
    let mut results = Vec::new();

    for tc in tool_calls {
        let tool_call = crate::providers::ToolCall {
            id: tc.id.clone(),
            name: tc.name,
            arguments: tc.arguments,
        };

        let result = execute_tool_as_string(&tool_call);
        let is_error = tool_result_is_error(&result);

        results.push(ToolResultOutput {
            tool_use_id: tc.id,
            content: result,
            is_error,
        });
    }

    Ok(results)
}

/// Tool result to send back to the AI
#[derive(Debug, Serialize)]
pub struct ToolResultOutput {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

/// Get available providers
#[tauri::command]
pub async fn get_providers(state: State<'_, Arc<AppState>>) -> Result<Vec<ProviderInfo>, String> {
    let providers = state.providers.read().await;
    let active = state.active_provider.read().await;

    let mut infos = Vec::new();

    for (name, provider) in providers.iter() {
        infos.push(ProviderInfo {
            name: name.clone(),
            display_name: provider.name().to_string(),
            is_active: active.as_ref() == Some(name),
            supports_tools: provider.supports_tools(),
            available_models: provider.available_models().iter().map(|s| s.to_string()).collect(),
            current_model: provider.model().to_string(),
        });
    }

    Ok(infos)
}

#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub display_name: String,
    pub is_active: bool,
    pub supports_tools: bool,
    pub available_models: Vec<String>,
    pub current_model: String,
}

/// Set the active provider
#[tauri::command]
pub async fn set_active_provider(
    state: State<'_, Arc<AppState>>,
    provider_name: String,
) -> Result<(), String> {
    state.set_active_provider(&provider_name).await
}

/// Set the model for a provider
#[tauri::command]
pub async fn set_provider_model(
    state: State<'_, Arc<AppState>>,
    provider_name: String,
    model: String,
) -> Result<(), String> {
    // Note: This would require mutable access to the provider
    // For now, we'll need to recreate the provider with the new model
    // This is a limitation of the current architecture

    let providers = state.providers.read().await;
    if !providers.contains_key(&provider_name) {
        return Err(format!("Provider '{}' not found", provider_name));
    }

    // Log the model change request
    log::info!("Model change requested for {}: {}", provider_name, model);

    // In a real implementation, you'd update the provider's model
    // This might require a different approach with interior mutability

    Ok(())
}
