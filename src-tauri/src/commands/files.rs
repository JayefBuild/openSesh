//! File operation commands
//!
//! This module provides Tauri commands for file operations including
//! reading, writing, listing directories, and searching.

use std::sync::Arc;
use serde::Serialize;
use tauri::State;

use crate::state::AppState;
use crate::tools::{file_ops, search, FileEntry, GlobMatch, SearchResult};

/// Read the contents of a file
#[tauri::command]
pub async fn read_file(path: String) -> Result<FileReadResult, String> {
    let content = file_ops::read_file(&path).map_err(|e| e.to_string())?;

    Ok(FileReadResult {
        content,
        path,
        truncated: false,
    })
}

#[derive(Debug, Serialize)]
pub struct FileReadResult {
    pub content: String,
    pub path: String,
    pub truncated: bool,
}

/// Read a file with a line limit
#[tauri::command]
pub async fn read_file_lines(path: String, max_lines: usize) -> Result<FileReadResult, String> {
    let (content, truncated) = file_ops::read_file_lines(&path, max_lines).map_err(|e| e.to_string())?;

    Ok(FileReadResult {
        content,
        path,
        truncated,
    })
}

/// Write content to a file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<WriteResult, String> {
    file_ops::write_file(&path, &content).map_err(|e| e.to_string())?;

    Ok(WriteResult {
        success: true,
        path,
    })
}

#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub success: bool,
    pub path: String,
}

/// List the contents of a directory
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    file_ops::list_directory(&path).map_err(|e| e.to_string())
}

/// List a directory recursively
#[tauri::command]
pub async fn list_directory_recursive(
    path: String,
    max_depth: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    file_ops::list_directory_recursive(&path, max_depth).map_err(|e| e.to_string())
}

/// Search for files matching a glob pattern
#[tauri::command]
pub async fn search_files(pattern: String, path: String) -> Result<Vec<GlobMatch>, String> {
    search::search_files(&pattern, &path).map_err(|e| e.to_string())
}

/// Search for text in files using a regex pattern
#[tauri::command]
pub async fn grep_files(
    query: String,
    path: String,
    file_pattern: Option<String>,
) -> Result<GrepResult, String> {
    let results = search::grep_files(&query, &path, file_pattern.as_deref())
        .map_err(|e| e.to_string())?;

    Ok(GrepResult {
        results: results.clone(),
        count: results.len(),
    })
}

#[derive(Debug, Serialize)]
pub struct GrepResult {
    pub results: Vec<SearchResult>,
    pub count: usize,
}

/// Search with context lines
#[tauri::command]
pub async fn grep_files_with_context(
    query: String,
    path: String,
    file_pattern: Option<String>,
    context_lines: usize,
) -> Result<GrepWithContextResult, String> {
    let results = search::grep_files_with_context(&query, &path, file_pattern.as_deref(), context_lines)
        .map_err(|e| e.to_string())?;

    Ok(GrepWithContextResult {
        results: results.clone(),
        count: results.len(),
    })
}

#[derive(Debug, Serialize)]
pub struct GrepWithContextResult {
    pub results: Vec<search::SearchResultWithContext>,
    pub count: usize,
}

/// Check if a path exists
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(file_ops::path_exists(&path))
}

/// Check if a path is a file
#[tauri::command]
pub async fn is_file(path: String) -> Result<bool, String> {
    Ok(file_ops::is_file(&path))
}

/// Check if a path is a directory
#[tauri::command]
pub async fn is_directory(path: String) -> Result<bool, String> {
    Ok(file_ops::is_directory(&path))
}

/// Get file metadata
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileEntry, String> {
    file_ops::get_file_info(&path).map_err(|e| e.to_string())
}

/// Create a directory
#[tauri::command]
pub async fn create_directory(path: String) -> Result<WriteResult, String> {
    file_ops::create_directory(&path).map_err(|e| e.to_string())?;

    Ok(WriteResult {
        success: true,
        path,
    })
}

/// Delete a file
#[tauri::command]
pub async fn delete_file(path: String) -> Result<WriteResult, String> {
    file_ops::delete_file(&path).map_err(|e| e.to_string())?;

    Ok(WriteResult {
        success: true,
        path,
    })
}

/// Copy a file
#[tauri::command]
pub async fn copy_file(from: String, to: String) -> Result<WriteResult, String> {
    file_ops::copy_file(&from, &to).map_err(|e| e.to_string())?;

    Ok(WriteResult {
        success: true,
        path: to,
    })
}

/// Move/rename a file
#[tauri::command]
pub async fn move_file(from: String, to: String) -> Result<WriteResult, String> {
    file_ops::move_file(&from, &to).map_err(|e| e.to_string())?;

    Ok(WriteResult {
        success: true,
        path: to,
    })
}

/// Set the project path
#[tauri::command]
pub async fn set_project_path(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    state.set_project_path(path_buf).await;
    Ok(())
}

/// Get the current project path
#[tauri::command]
pub async fn get_project_path(state: State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let path = state.get_project_path().await;
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

/// Open a file dialog to select a directory
#[tauri::command]
pub async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    app.dialog()
        .file()
        .set_title("Select Project Folder")
        .pick_folder(move |folder_path| {
            let _ = tx.send(folder_path);
        });

    match rx.recv() {
        Ok(Some(path)) => Ok(Some(path.to_string())),
        Ok(None) => Ok(None),
        Err(_) => Ok(None),
    }
}
