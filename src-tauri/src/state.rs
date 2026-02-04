//! Application state management for Open Sesh
//!
//! This module contains the central AppState struct that holds
//! all shared state across the application including terminal sessions,
//! AI providers, and project configuration.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::providers::{Provider, AnthropicProvider, OpenAIProvider};

/// Central application state shared across all Tauri commands
pub struct AppState {
    /// Available AI providers
    pub providers: RwLock<HashMap<String, Arc<dyn Provider>>>,

    /// Current active provider name
    pub active_provider: RwLock<Option<String>>,

    /// Current project root path
    pub project_path: RwLock<Option<PathBuf>>,
}

impl AppState {
    /// Create a new AppState with default configuration
    pub fn new() -> Self {
        Self {
            providers: RwLock::new(HashMap::new()),
            active_provider: RwLock::new(None),
            project_path: RwLock::new(None),
        }
    }

    /// Initialize providers from environment variables
    pub async fn init_providers(&self) {
        let mut providers = self.providers.write().await;

        // Try to initialize Anthropic provider
        if let Ok(api_key) = std::env::var("ANTHROPIC_API_KEY") {
            if !api_key.is_empty() {
                let provider = AnthropicProvider::new(api_key);
                providers.insert("anthropic".to_string(), Arc::new(provider) as Arc<dyn Provider>);
                log::info!("Initialized Anthropic provider");

                // Set as default if no active provider
                let mut active = self.active_provider.write().await;
                if active.is_none() {
                    *active = Some("anthropic".to_string());
                }
            }
        }

        // Try to initialize OpenAI provider
        if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
            if !api_key.is_empty() {
                let provider = OpenAIProvider::new(api_key);
                providers.insert("openai".to_string(), Arc::new(provider) as Arc<dyn Provider>);
                log::info!("Initialized OpenAI provider");

                // Set as default if no active provider
                let mut active = self.active_provider.write().await;
                if active.is_none() {
                    *active = Some("openai".to_string());
                }
            }
        }

        if providers.is_empty() {
            log::warn!("No AI providers configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variables.");
        }
    }

    /// Get a provider by name
    pub async fn get_provider(&self, name: &str) -> Option<Arc<dyn Provider>> {
        let providers = self.providers.read().await;
        providers.get(name).cloned()
    }

    /// Get the currently active provider
    pub async fn get_active_provider(&self) -> Option<Arc<dyn Provider>> {
        let active = self.active_provider.read().await;
        if let Some(name) = active.as_ref() {
            self.get_provider(name).await
        } else {
            None
        }
    }

    /// Set the active provider
    pub async fn set_active_provider(&self, name: &str) -> Result<(), String> {
        let providers = self.providers.read().await;
        if providers.contains_key(name) {
            let mut active = self.active_provider.write().await;
            *active = Some(name.to_string());
            Ok(())
        } else {
            Err(format!("Provider '{}' not found", name))
        }
    }

    /// Set the current project path
    pub async fn set_project_path(&self, path: PathBuf) {
        let mut project_path = self.project_path.write().await;
        *project_path = Some(path);
    }

    /// Get the current project path
    pub async fn get_project_path(&self) -> Option<PathBuf> {
        let project_path = self.project_path.read().await;
        project_path.clone()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

// AppState needs to be Send + Sync for Tauri
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}
