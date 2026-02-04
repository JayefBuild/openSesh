//! File operations for the tools system
//!
//! This module provides file reading, writing, and directory listing operations
//! that can be used by AI assistants.

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::{FileEntry, ToolError, ToolResult};

/// Read the contents of a file
///
/// # Arguments
/// * `path` - Path to the file to read
///
/// # Returns
/// The file contents as a string
pub fn read_file(path: &str) -> ToolResult<String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(ToolError::PathNotFound(path.display().to_string()));
    }

    if !path.is_file() {
        return Err(ToolError::InvalidArgument(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }

    fs::read_to_string(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ToolError::PermissionDenied(path.display().to_string())
        } else {
            ToolError::IoError(e)
        }
    })
}

/// Read the contents of a file with a line limit
///
/// # Arguments
/// * `path` - Path to the file to read
/// * `max_lines` - Maximum number of lines to read
///
/// # Returns
/// The file contents as a string, truncated if necessary
pub fn read_file_lines(path: &str, max_lines: usize) -> ToolResult<(String, bool)> {
    let content = read_file(path)?;
    let lines: Vec<&str> = content.lines().collect();

    if lines.len() > max_lines {
        let truncated = lines[..max_lines].join("\n");
        Ok((truncated, true))
    } else {
        Ok((content, false))
    }
}

/// Write content to a file
///
/// # Arguments
/// * `path` - Path to the file to write
/// * `content` - Content to write
///
/// # Returns
/// Success or error
pub fn write_file(path: &str, content: &str) -> ToolResult<()> {
    let path = Path::new(path);

    // Create parent directories if they don't exist
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, content).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ToolError::PermissionDenied(path.display().to_string())
        } else {
            ToolError::IoError(e)
        }
    })
}

/// List the contents of a directory
///
/// # Arguments
/// * `path` - Path to the directory to list
///
/// # Returns
/// A vector of file entries
pub fn list_directory(path: &str) -> ToolResult<Vec<FileEntry>> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(ToolError::PathNotFound(path.display().to_string()));
    }

    if !path.is_dir() {
        return Err(ToolError::InvalidArgument(format!(
            "Path is not a directory: {}",
            path.display()
        )));
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        let file_type = metadata.file_type();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let extension = entry
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_string());

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
            size: metadata.len(),
            modified,
            extension,
        });
    }

    // Sort entries: directories first, then files, both alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

/// List the contents of a directory recursively
///
/// # Arguments
/// * `path` - Path to the directory to list
/// * `max_depth` - Maximum recursion depth (None for unlimited)
///
/// # Returns
/// A vector of file entries
pub fn list_directory_recursive(path: &str, max_depth: Option<usize>) -> ToolResult<Vec<FileEntry>> {
    use walkdir::WalkDir;

    let path = Path::new(path);

    if !path.exists() {
        return Err(ToolError::PathNotFound(path.display().to_string()));
    }

    let walker = match max_depth {
        Some(depth) => WalkDir::new(path).max_depth(depth),
        None => WalkDir::new(path),
    };

    let mut entries = Vec::new();

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        // Skip the root directory itself
        if entry.path() == path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_type = metadata.file_type();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let extension = entry
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_string());

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
            size: metadata.len(),
            modified,
            extension,
        });
    }

    Ok(entries)
}

/// Check if a path exists
pub fn path_exists(path: &str) -> bool {
    Path::new(path).exists()
}

/// Check if a path is a file
pub fn is_file(path: &str) -> bool {
    Path::new(path).is_file()
}

/// Check if a path is a directory
pub fn is_directory(path: &str) -> bool {
    Path::new(path).is_dir()
}

/// Get file metadata
pub fn get_file_info(path: &str) -> ToolResult<FileEntry> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(ToolError::PathNotFound(path.display().to_string()));
    }

    let metadata = fs::metadata(path)?;
    let file_type = metadata.file_type();

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    let extension = path.extension().map(|e| e.to_string_lossy().to_string());

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: file_type.is_dir(),
        is_file: file_type.is_file(),
        is_symlink: file_type.is_symlink(),
        size: metadata.len(),
        modified,
        extension,
    })
}

/// Create a directory and all parent directories
pub fn create_directory(path: &str) -> ToolResult<()> {
    fs::create_dir_all(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ToolError::PermissionDenied(path.to_string())
        } else {
            ToolError::IoError(e)
        }
    })
}

/// Delete a file
pub fn delete_file(path: &str) -> ToolResult<()> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(ToolError::PathNotFound(path.display().to_string()));
    }

    if !path.is_file() {
        return Err(ToolError::InvalidArgument(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }

    fs::remove_file(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ToolError::PermissionDenied(path.display().to_string())
        } else {
            ToolError::IoError(e)
        }
    })
}

/// Copy a file
pub fn copy_file(from: &str, to: &str) -> ToolResult<()> {
    let from_path = Path::new(from);
    let to_path = Path::new(to);

    if !from_path.exists() {
        return Err(ToolError::PathNotFound(from.to_string()));
    }

    // Create parent directories if they don't exist
    if let Some(parent) = to_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::copy(from_path, to_path)?;
    Ok(())
}

/// Move/rename a file
pub fn move_file(from: &str, to: &str) -> ToolResult<()> {
    let from_path = Path::new(from);
    let to_path = Path::new(to);

    if !from_path.exists() {
        return Err(ToolError::PathNotFound(from.to_string()));
    }

    // Create parent directories if they don't exist
    if let Some(parent) = to_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::rename(from_path, to_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_read_write_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        let path_str = file_path.to_str().unwrap();

        // Write
        write_file(path_str, "Hello, World!").unwrap();

        // Read
        let content = read_file(path_str).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_list_directory() {
        let dir = tempdir().unwrap();

        // Create some files
        fs::write(dir.path().join("a.txt"), "").unwrap();
        fs::write(dir.path().join("b.txt"), "").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(entries.len(), 3);

        // First entry should be directory (sorted first)
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "subdir");
    }

    #[test]
    fn test_path_not_found() {
        let result = read_file("/nonexistent/path/file.txt");
        assert!(matches!(result, Err(ToolError::PathNotFound(_))));
    }
}
