//! Tool executor - routes tool calls to their implementations
//!
//! This module provides the ToolExecutor which receives tool calls from AI providers
//! and routes them to the appropriate tool implementations.

use serde_json::{json, Value};

use super::{file_ops, search, ToolError, ToolResult};
use crate::providers::ToolCall;

/// Execute a tool call and return the result as JSON
pub fn execute_tool(tool_call: &ToolCall) -> ToolResult<Value> {
    match tool_call.name.as_str() {
        "read_file" => execute_read_file(&tool_call.arguments),
        "write_file" => execute_write_file(&tool_call.arguments),
        "list_directory" => execute_list_directory(&tool_call.arguments),
        "search_files" => execute_search_files(&tool_call.arguments),
        "grep_files" => execute_grep_files(&tool_call.arguments),
        _ => Err(ToolError::ToolNotFound(tool_call.name.clone())),
    }
}

/// Execute read_file tool
fn execute_read_file(args: &Value) -> ToolResult<Value> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'path' argument".to_string()))?;

    let content = file_ops::read_file(path)?;

    Ok(json!({
        "success": true,
        "content": content
    }))
}

/// Execute write_file tool
fn execute_write_file(args: &Value) -> ToolResult<Value> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'path' argument".to_string()))?;

    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'content' argument".to_string()))?;

    file_ops::write_file(path, content)?;

    Ok(json!({
        "success": true,
        "message": format!("File written successfully: {}", path)
    }))
}

/// Execute list_directory tool
fn execute_list_directory(args: &Value) -> ToolResult<Value> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'path' argument".to_string()))?;

    let entries = file_ops::list_directory(path)?;

    Ok(json!({
        "success": true,
        "entries": entries
    }))
}

/// Execute search_files tool
fn execute_search_files(args: &Value) -> ToolResult<Value> {
    let pattern = args
        .get("pattern")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'pattern' argument".to_string()))?;

    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'path' argument".to_string()))?;

    let matches = search::search_files(pattern, path)?;

    Ok(json!({
        "success": true,
        "matches": matches
    }))
}

/// Execute grep_files tool
fn execute_grep_files(args: &Value) -> ToolResult<Value> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'query' argument".to_string()))?;

    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolError::InvalidArgument("Missing 'path' argument".to_string()))?;

    let file_pattern = args.get("file_pattern").and_then(|v| v.as_str());

    let results = search::grep_files(query, path, file_pattern)?;

    Ok(json!({
        "success": true,
        "results": results,
        "count": results.len()
    }))
}

/// Execute a tool and return the result as a string (for tool result messages)
pub fn execute_tool_as_string(tool_call: &ToolCall) -> String {
    match execute_tool(tool_call) {
        Ok(value) => serde_json::to_string_pretty(&value).unwrap_or_else(|e| {
            format!("{{\"error\": \"Failed to serialize result: {}\"}}", e)
        }),
        Err(e) => {
            json!({
                "success": false,
                "error": e.to_string()
            })
            .to_string()
        }
    }
}

/// Check if a tool call resulted in an error
pub fn tool_result_is_error(result: &str) -> bool {
    if let Ok(value) = serde_json::from_str::<Value>(result) {
        if let Some(success) = value.get("success").and_then(|v| v.as_bool()) {
            return !success;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_execute_read_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "Hello, World!").unwrap();

        let tool_call = ToolCall {
            id: "test-1".to_string(),
            name: "read_file".to_string(),
            arguments: json!({
                "path": file_path.to_str().unwrap()
            }),
        };

        let result = execute_tool(&tool_call).unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["content"], "Hello, World!");
    }

    #[test]
    fn test_execute_write_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        let tool_call = ToolCall {
            id: "test-1".to_string(),
            name: "write_file".to_string(),
            arguments: json!({
                "path": file_path.to_str().unwrap(),
                "content": "Hello, World!"
            }),
        };

        let result = execute_tool(&tool_call).unwrap();
        assert_eq!(result["success"], true);

        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_execute_list_directory() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "").unwrap();
        fs::write(dir.path().join("b.txt"), "").unwrap();

        let tool_call = ToolCall {
            id: "test-1".to_string(),
            name: "list_directory".to_string(),
            arguments: json!({
                "path": dir.path().to_str().unwrap()
            }),
        };

        let result = execute_tool(&tool_call).unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["entries"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_unknown_tool() {
        let tool_call = ToolCall {
            id: "test-1".to_string(),
            name: "unknown_tool".to_string(),
            arguments: json!({}),
        };

        let result = execute_tool(&tool_call);
        assert!(matches!(result, Err(ToolError::ToolNotFound(_))));
    }
}
