//! Tool implementations for AI assistants
//!
//! This module provides the tools that AI assistants can use to interact
//! with the filesystem, search code, and execute operations.

pub mod file_ops;
pub mod search;
pub mod executor;

pub use file_ops::*;
pub use search::*;
pub use executor::*;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors that can occur when executing tools
#[derive(Debug, Error)]
pub enum ToolError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Tool not found: {0}")]
    ToolNotFound(String),

    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Pattern error: {0}")]
    PatternError(String),
}

/// Result type for tool operations
pub type ToolResult<T> = Result<T, ToolError>;

/// A file entry with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

/// A search result with context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub line_number: u64,
    pub line_content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_start: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_end: Option<usize>,
}

/// File match from glob search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobMatch {
    pub path: String,
    pub is_dir: bool,
}

/// Tool definition for AI providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Get all available tool definitions
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            description: "Read the contents of a file at the given path".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the file to read"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "write_file".to_string(),
            description: "Write content to a file at the given path".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "list_directory".to_string(),
            description: "List the contents of a directory".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the directory to list"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "search_files".to_string(),
            description: "Search for files matching a glob pattern".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "The glob pattern to match (e.g., '**/*.rs')"
                    },
                    "path": {
                        "type": "string",
                        "description": "The base directory to search in"
                    }
                },
                "required": ["pattern", "path"]
            }),
        },
        ToolDefinition {
            name: "grep_files".to_string(),
            description: "Search for text in files using a regex pattern".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The regex pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "The directory to search in"
                    },
                    "file_pattern": {
                        "type": "string",
                        "description": "Optional glob pattern to filter files (e.g., '*.rs')"
                    }
                },
                "required": ["query", "path"]
            }),
        },
    ]
}
