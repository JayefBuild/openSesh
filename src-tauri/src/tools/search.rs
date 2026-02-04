//! Search operations for the tools system
//!
//! This module provides glob-based file searching and grep-like text searching
//! capabilities that can be used by AI assistants.

use std::path::Path;
use std::fs;
use std::io::BufRead;

use glob::glob;
use grep_regex::RegexMatcher;
use grep_searcher::{Searcher, Sink, SinkMatch};

use super::{GlobMatch, SearchResult, ToolError, ToolResult};

/// Search for files matching a glob pattern
///
/// # Arguments
/// * `pattern` - The glob pattern to match (e.g., "**/*.rs")
/// * `base_path` - The base directory to search in
///
/// # Returns
/// A vector of matching file paths
pub fn search_files(pattern: &str, base_path: &str) -> ToolResult<Vec<GlobMatch>> {
    let base = Path::new(base_path);

    if !base.exists() {
        return Err(ToolError::PathNotFound(base_path.to_string()));
    }

    if !base.is_dir() {
        return Err(ToolError::InvalidArgument(format!(
            "Base path is not a directory: {}",
            base_path
        )));
    }

    // Construct the full pattern
    let full_pattern = base.join(pattern);
    let pattern_str = full_pattern.to_string_lossy();

    let mut matches = Vec::new();

    for entry in glob(&pattern_str).map_err(|e| ToolError::PatternError(e.to_string()))? {
        match entry {
            Ok(path) => {
                let is_dir = path.is_dir();
                matches.push(GlobMatch {
                    path: path.to_string_lossy().to_string(),
                    is_dir,
                });
            }
            Err(e) => {
                log::warn!("Glob error for entry: {}", e);
            }
        }
    }

    // Sort by path
    matches.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(matches)
}

/// Search for text in files using a regex pattern
///
/// # Arguments
/// * `query` - The regex pattern to search for
/// * `path` - The directory to search in
/// * `file_pattern` - Optional glob pattern to filter files
///
/// # Returns
/// A vector of search results with line numbers and content
pub fn grep_files(
    query: &str,
    path: &str,
    file_pattern: Option<&str>,
) -> ToolResult<Vec<SearchResult>> {
    let base = Path::new(path);

    if !base.exists() {
        return Err(ToolError::PathNotFound(path.to_string()));
    }

    // Create the regex matcher
    let matcher = RegexMatcher::new(query)
        .map_err(|e| ToolError::PatternError(format!("Invalid regex: {}", e)))?;

    let mut results = Vec::new();

    // Get files to search
    let files: Vec<String> = if let Some(pattern) = file_pattern {
        search_files(pattern, path)?
            .into_iter()
            .filter(|m| !m.is_dir)
            .map(|m| m.path)
            .collect()
    } else {
        // Search all files recursively
        collect_files_recursive(base)?
    };

    for file_path in files {
        let file_results = search_in_file(&matcher, &file_path)?;
        results.extend(file_results);
    }

    Ok(results)
}

/// Collect all files recursively from a directory
fn collect_files_recursive(path: &Path) -> ToolResult<Vec<String>> {
    use walkdir::WalkDir;

    let mut files = Vec::new();

    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        // Skip binary files and hidden directories
        let entry_path = entry.path();

        // Skip hidden files and directories
        if entry_path
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
        {
            continue;
        }

        // Skip common binary/generated directories
        let path_str = entry_path.to_string_lossy();
        if path_str.contains("/target/")
            || path_str.contains("/node_modules/")
            || path_str.contains("/.git/")
            || path_str.contains("/dist/")
            || path_str.contains("/build/")
        {
            continue;
        }

        // Check if file is likely text
        if is_likely_text_file(entry_path) {
            files.push(entry_path.to_string_lossy().to_string());
        }
    }

    Ok(files)
}

/// Check if a file is likely a text file based on extension
fn is_likely_text_file(path: &Path) -> bool {
    let text_extensions = [
        "rs", "js", "ts", "jsx", "tsx", "py", "rb", "go", "java", "c", "cpp", "h", "hpp",
        "cs", "php", "swift", "kt", "scala", "clj", "ex", "exs", "erl", "hrl",
        "html", "htm", "css", "scss", "sass", "less", "xml", "json", "yaml", "yml",
        "toml", "ini", "cfg", "conf", "md", "txt", "rst", "adoc",
        "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
        "sql", "graphql", "prisma",
        "dockerfile", "makefile", "cmake",
        "gitignore", "gitattributes", "editorconfig",
        "env", "env.local", "env.example",
        "lock", // Cargo.lock, package-lock.json, etc.
    ];

    // Check extension
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        if text_extensions.iter().any(|&e| e == ext_lower) {
            return true;
        }
    }

    // Check for extensionless files that are commonly text
    if let Some(name) = path.file_name() {
        let name_lower = name.to_string_lossy().to_lowercase();
        let text_filenames = [
            "makefile", "dockerfile", "jenkinsfile", "rakefile",
            "gemfile", "brewfile", "procfile", "vagrantfile",
            "cargo.toml", "cargo.lock", "package.json", "package-lock.json",
            "tsconfig.json", "jsconfig.json", ".gitignore", ".gitattributes",
            ".editorconfig", ".prettierrc", ".eslintrc", "readme", "license",
            "changelog", "contributing", "authors", "maintainers",
        ];
        if text_filenames.iter().any(|&f| name_lower == f || name_lower.starts_with(f)) {
            return true;
        }
    }

    false
}

/// Search for matches in a single file
fn search_in_file(matcher: &RegexMatcher, file_path: &str) -> ToolResult<Vec<SearchResult>> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    // Use a simple line-by-line search for better control
    let file = fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);

    for (line_num, line_result) in reader.lines().enumerate() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue, // Skip lines that can't be read as UTF-8
        };

        // Check if line matches
        let mut sink = MatchSink::new();
        let result = Searcher::new().search_slice(matcher, line.as_bytes(), &mut sink);

        if result.is_ok() && !sink.matches.is_empty() {
            for (start, end) in sink.matches {
                results.push(SearchResult {
                    path: file_path.to_string(),
                    line_number: (line_num + 1) as u64,
                    line_content: line.clone(),
                    match_start: Some(start),
                    match_end: Some(end),
                });
            }
        }
    }

    Ok(results)
}

/// Sink for collecting match positions
struct MatchSink {
    matches: Vec<(usize, usize)>,
}

impl MatchSink {
    fn new() -> Self {
        Self { matches: Vec::new() }
    }
}

impl Sink for MatchSink {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        // For now, just record that there was a match
        // The actual match position is in the bytes
        self.matches.push((0, mat.bytes().len()));
        Ok(true)
    }
}

/// Search with context lines
pub fn grep_files_with_context(
    query: &str,
    path: &str,
    file_pattern: Option<&str>,
    context_lines: usize,
) -> ToolResult<Vec<SearchResultWithContext>> {
    let base = Path::new(path);

    if !base.exists() {
        return Err(ToolError::PathNotFound(path.to_string()));
    }

    // Create the regex matcher
    let matcher = RegexMatcher::new(query)
        .map_err(|e| ToolError::PatternError(format!("Invalid regex: {}", e)))?;

    let mut results = Vec::new();

    // Get files to search
    let files: Vec<String> = if let Some(pattern) = file_pattern {
        search_files(pattern, path)?
            .into_iter()
            .filter(|m| !m.is_dir)
            .map(|m| m.path)
            .collect()
    } else {
        collect_files_recursive(base)?
    };

    for file_path in files {
        if let Ok(file_results) = search_in_file_with_context(&matcher, &file_path, context_lines) {
            results.extend(file_results);
        }
    }

    Ok(results)
}

/// Search result with context lines
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResultWithContext {
    pub path: String,
    pub line_number: u64,
    pub line_content: String,
    pub before_context: Vec<String>,
    pub after_context: Vec<String>,
}

/// Search in a file with context lines
fn search_in_file_with_context(
    matcher: &RegexMatcher,
    file_path: &str,
    context_lines: usize,
) -> ToolResult<Vec<SearchResultWithContext>> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    let lines: Vec<&str> = content.lines().collect();
    let mut results = Vec::new();

    for (line_num, line) in lines.iter().enumerate() {
        let mut sink = MatchSink::new();
        let result = Searcher::new().search_slice(matcher, line.as_bytes(), &mut sink);

        if result.is_ok() && !sink.matches.is_empty() {
            let start = line_num.saturating_sub(context_lines);
            let end = (line_num + context_lines + 1).min(lines.len());

            let before_context: Vec<String> = lines[start..line_num]
                .iter()
                .map(|s| s.to_string())
                .collect();

            let after_context: Vec<String> = if line_num + 1 < end {
                lines[line_num + 1..end]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                Vec::new()
            };

            results.push(SearchResultWithContext {
                path: file_path.to_string(),
                line_number: (line_num + 1) as u64,
                line_content: line.to_string(),
                before_context,
                after_context,
            });
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_search_files() {
        let dir = tempdir().unwrap();

        // Create test files
        fs::write(dir.path().join("test1.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("test2.rs"), "fn test() {}").unwrap();
        fs::write(dir.path().join("other.txt"), "hello").unwrap();

        let results = search_files("*.rs", dir.path().to_str().unwrap()).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_grep_files() {
        let dir = tempdir().unwrap();

        // Create test files
        fs::write(dir.path().join("test1.rs"), "fn main() {\n    println!(\"hello\");\n}").unwrap();
        fs::write(dir.path().join("test2.rs"), "fn test() {\n    println!(\"world\");\n}").unwrap();

        let results = grep_files("println", dir.path().to_str().unwrap(), Some("*.rs")).unwrap();
        assert_eq!(results.len(), 2);
    }
}
