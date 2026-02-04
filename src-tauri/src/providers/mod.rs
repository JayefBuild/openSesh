//! AI Provider implementations
//!
//! This module contains the Provider trait and implementations
//! for various AI providers (Anthropic, OpenAI, etc.)

pub mod types;
pub mod anthropic;
pub mod openai;

pub use types::*;
pub use anthropic::AnthropicProvider;
pub use openai::OpenAIProvider;

use async_trait::async_trait;
use std::pin::Pin;
use futures::Stream;
use thiserror::Error;

/// Errors that can occur when interacting with AI providers
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    #[error("API error: {status} - {message}")]
    ApiError { status: u16, message: String },

    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Stream error: {0}")]
    StreamError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("Rate limited: retry after {retry_after:?} seconds")]
    RateLimited { retry_after: Option<u64> },

    #[error("Provider not configured: {0}")]
    NotConfigured(String),

    #[error("Unsupported operation: {0}")]
    Unsupported(String),
}

/// Trait for AI providers
///
/// This trait defines the interface that all AI providers must implement
/// to be used in Open Sesh. It supports both synchronous and streaming
/// chat completions, as well as tool/function calling.
#[async_trait]
pub trait Provider: Send + Sync {
    /// Send a chat request and get a complete response
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<ChatResponse, ProviderError>;

    /// Send a chat request and get a streaming response
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<Tool>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatChunk, ProviderError>> + Send>>, ProviderError>;

    /// Get the provider name
    fn name(&self) -> &str;

    /// Check if this provider supports tool/function calling
    fn supports_tools(&self) -> bool;

    /// Get the default model for this provider
    fn default_model(&self) -> &str;

    /// Get available models for this provider
    fn available_models(&self) -> Vec<&str>;

    /// Set the model to use
    fn set_model(&mut self, model: &str);

    /// Get the current model
    fn model(&self) -> &str;

    /// Set the system prompt
    fn set_system_prompt(&mut self, prompt: Option<String>);

    /// Get the system prompt
    fn system_prompt(&self) -> Option<&str>;

    /// Set max tokens
    fn set_max_tokens(&mut self, max_tokens: u32);

    /// Get max tokens
    fn max_tokens(&self) -> u32;

    /// Set temperature
    fn set_temperature(&mut self, temperature: f32);

    /// Get temperature
    fn temperature(&self) -> f32;
}

/// Helper function to create a provider from configuration
pub fn create_provider(config: &ProviderConfig) -> Result<Box<dyn Provider>, ProviderError> {
    match config.name.as_str() {
        "anthropic" => {
            let mut provider = AnthropicProvider::new(config.api_key.clone());
            if let Some(model) = &config.model {
                provider.set_model(model);
            }
            if let Some(max_tokens) = config.max_tokens {
                provider.set_max_tokens(max_tokens);
            }
            if let Some(temperature) = config.temperature {
                provider.set_temperature(temperature);
            }
            Ok(Box::new(provider))
        }
        "openai" => {
            let mut provider = OpenAIProvider::new(config.api_key.clone());
            if let Some(model) = &config.model {
                provider.set_model(model);
            }
            if let Some(max_tokens) = config.max_tokens {
                provider.set_max_tokens(max_tokens);
            }
            if let Some(temperature) = config.temperature {
                provider.set_temperature(temperature);
            }
            Ok(Box::new(provider))
        }
        _ => Err(ProviderError::NotConfigured(format!(
            "Unknown provider: {}",
            config.name
        ))),
    }
}
