use serde::{Deserialize, Serialize};
use encoding_rs::Encoding;

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct ProxyResponse {
    pub content: String,
    pub url: String,
    pub status: u16,
}

pub async fn fetch_url_impl(url: String, client: &reqwest::Client) -> Result<ProxyResponse, String> {
    println!("Fetching URL: {url}");
    
    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .header("DNT", "1")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            eprintln!("Request failed: {e}");
            format!("Request failed: {e}")
        })?;
    
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    
    println!("Response status: {status}, Final URL: {final_url}");
    
    // レスポンスヘッダーをチェック（borrowを先に済ませる）
    let content_type = response.headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("")
        .to_string(); // Stringに変換してownershipを移す
    
    let content_encoding = response.headers()
        .get("content-encoding")
        .and_then(|ce| ce.to_str().ok())
        .unwrap_or("")
        .to_string();
    
    println!("Content-Type: {content_type}");
    println!("Content-Encoding: {content_encoding}");
    
    // X-Frame-Optionsヘッダーの確認とログ出力
    if let Some(x_frame_options) = response.headers().get("x-frame-options") {
        if let Ok(value) = x_frame_options.to_str() {
            println!("X-Frame-Options detected and will be ignored: {value}");
        }
    }
    
    // バイト形式で取得してから適切にデコード
    let bytes = response.bytes().await.map_err(|e| {
        eprintln!("Failed to read response bytes: {e}");
        format!("Failed to read response bytes: {e}")
    })?;
    
    println!("Response bytes length: {}", bytes.len());
    
    // エンコーディングを推測・変換
    let content = decode_response_content(&bytes, &content_type)?;
    
    println!("Content length after decoding: {} characters", content.len());
    
    Ok(ProxyResponse {
        content,
        url: final_url,
        status,
    })
}

#[tauri::command]
async fn fetch_url(url: String) -> Result<ProxyResponse, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8".parse().unwrap());
    headers.insert("Accept-Language", "en-US,en;q=0.5".parse().unwrap());
    // Accept-Encodingヘッダーを削除してreqwestに自動処理させる
    headers.insert("Connection", "keep-alive".parse().unwrap());
    headers.insert("Upgrade-Insecure-Requests", "1".parse().unwrap());
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .default_headers(headers)
        .redirect(reqwest::redirect::Policy::limited(10))
        // reqwest 0.11では圧縮は自動的に処理される（明示的な設定は不要）
        .build()
        .map_err(|e| e.to_string())?;
    
    fetch_url_impl(url, &client).await
}

pub fn validate_url(url: &str) -> Result<(), String> {
    if url.is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }
    
    url::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    Ok(())
}

fn decode_response_content(bytes: &[u8], content_type: &str) -> Result<String, String> {
    // まずUTF-8を試行
    if let Ok(utf8_content) = std::str::from_utf8(bytes) {
        return Ok(utf8_content.to_string());
    }
    
    // Content-Typeからcharsetを抽出
    let charset = if content_type.contains("charset=") {
        content_type
            .split("charset=")
            .nth(1)
            .unwrap_or("utf-8")
            .split(';')
            .next()
            .unwrap_or("utf-8")
            .trim()
            .to_lowercase()
    } else {
        "utf-8".to_string()
    };
    
    println!("Detected charset: {charset}");
    
    // encoding_rsを使用して適切にデコード
    let encoding = match charset.as_str() {
        "utf-8" | "utf8" => encoding_rs::UTF_8,
        "shift_jis" | "shift-jis" | "sjis" => encoding_rs::SHIFT_JIS,
        "euc-jp" | "eucjp" => encoding_rs::EUC_JP,
        "iso-2022-jp" => encoding_rs::ISO_2022_JP,
        "windows-1252" | "cp1252" => encoding_rs::WINDOWS_1252,
        "iso-8859-1" | "latin1" => encoding_rs::WINDOWS_1252, // フォールバック
        _ => {
            println!("Unknown charset {charset}, attempting auto-detection");
            // 自動検出を試行
            detect_encoding(bytes).unwrap_or(encoding_rs::UTF_8)
        }
    };
    
    let (decoded, _, had_errors) = encoding.decode(bytes);
    
    if had_errors {
        println!("Warning: Decoding had errors, some characters may be incorrect");
    }
    
    Ok(decoded.into_owned())
}

fn detect_encoding(bytes: &[u8]) -> Option<&'static Encoding> {
    // 簡単な文字コード検出
    // UTF-8 BOMをチェック
    if bytes.len() >= 3 && &bytes[0..3] == b"\xEF\xBB\xBF" {
        return Some(encoding_rs::UTF_8);
    }
    
    // UTF-16 BOMをチェック
    if bytes.len() >= 2
        && (&bytes[0..2] == b"\xFF\xFE" || &bytes[0..2] == b"\xFE\xFF") {
            return Some(encoding_rs::UTF_16LE);
        }
    
    // 日本語文字コードの簡易判定
    let sample = if bytes.len() > 1000 { &bytes[0..1000] } else { bytes };
    
    // Shift_JISの判定（簡易）
    for window in sample.windows(2) {
        let first = window[0];
        let second = window[1];
        
        // Shift_JISの1バイト目の範囲をチェック
        if (0x81..=0x9F).contains(&first) || (0xE0..=0xFC).contains(&first) {
            // 2バイト目の範囲をチェック
            if (0x40..=0x7E).contains(&second) || (0x80..=0xFC).contains(&second) {
                return Some(encoding_rs::SHIFT_JIS);
            }
        }
    }
    
    // EUC-JPの判定（簡易）
    for window in sample.windows(2) {
        let first = window[0];
        let second = window[1];
        
        if (0xA1..=0xFE).contains(&first) && (0xA1..=0xFE).contains(&second) {
            return Some(encoding_rs::EUC_JP);
        }
    }
    
    None
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    validate_url(&url)?;
    tauri_plugin_opener::open_url(&url, None::<String>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_validate_url_valid() {
        assert!(validate_url("https://www.google.com").is_ok());
        assert!(validate_url("http://localhost:3000").is_ok());
    }

    #[tokio::test]
    async fn test_validate_url_invalid() {
        assert!(validate_url("").is_err());
        assert!(validate_url("not-a-url").is_err());
        assert!(validate_url("ftp://example.com").is_err());
    }

    #[tokio::test]
    async fn test_fetch_url_success() {
        let mock_server = MockServer::start().await;
        
        Mock::given(method("GET"))
            .and(path("/test"))
            .respond_with(ResponseTemplate::new(200).set_body_string("<html><body>Test Content</body></html>"))
            .mount(&mock_server)
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/test", &mock_server.uri());
        
        let result = fetch_url_impl(url.clone(), &client).await;
        
        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.content, "<html><body>Test Content</body></html>");
        assert_eq!(response.url, url);
    }

    #[tokio::test]
    async fn test_fetch_url_404() {
        let mock_server = MockServer::start().await;
        
        Mock::given(method("GET"))
            .and(path("/not-found"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not Found"))
            .mount(&mock_server)
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/not-found", &mock_server.uri());
        
        let result = fetch_url_impl(url.clone(), &client).await;
        
        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, 404);
        assert_eq!(response.content, "Not Found");
    }

    #[tokio::test]
    async fn test_fetch_url_invalid_url() {
        let client = reqwest::Client::new();
        let result = fetch_url_impl("invalid-url".to_string(), &client).await;
        assert!(result.is_err());
    }
}
