const fs = require('fs');
const path = require('path');

/**
 * ファイル処理の共通ユーティリティ
 */
class FileProcessor {
  /**
   * 最近生成されたファイルを検索
   * @param {number|null} minutesAgo - 何分前までのファイルを対象とするか（nullの場合は制限なし）
   * @returns {Array} ファイル情報の配列
   */
  static findRecentFiles(minutesAgo = null) {
    // .envから設定を読み込み、未設定の場合は2分をデフォルトに（より短い時間でより正確に）
    const defaultMinutes = process.env.FILE_DETECTION_MINUTES ? parseInt(process.env.FILE_DETECTION_MINUTES) : 2;
    const actualMinutesAgo = minutesAgo !== null ? minutesAgo : defaultMinutes;
    try {
      const currentDir = process.cwd();
      const files = fs.readdirSync(currentDir);
      
      // 全メディアファイルタイプを検索
      const mediaExtensions = [
        // 画像
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff',
        // 動画
        '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
        // 音声
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma',
        // 3Dモデル
        '.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl',
        // その他
        '.zip', '.rar', '.7z', '.tar', '.gz'
      ];
      const recentFiles = [];
      
      // 時間制限チェック（0以下の場合は制限なし）
      const timeThreshold = actualMinutesAgo > 0 ? Date.now() - (actualMinutesAgo * 60 * 1000) : 0;
      
      for (const file of files) {
        const filePath = path.join(currentDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          
          if (stats.isFile() && (actualMinutesAgo <= 0 || stats.mtime.getTime() > timeThreshold)) {
            const ext = path.extname(file).toLowerCase();
            if (mediaExtensions.includes(ext)) {
              recentFiles.push({
                path: filePath,
                name: file,
                size: stats.size,
                mtime: stats.mtime
              });
            }
          }
        } catch (statError) {
          // ファイル情報取得エラーは無視
          console.warn(`Failed to get stats for ${file}:`, statError.message);
        }
      }
      
      // 更新時間でソート（新しい順）
      return recentFiles.sort((a, b) => b.mtime - a.mtime);
      
    } catch (error) {
      console.error('Error finding recent files:', error);
      return [];
    }
  }

  /**
   * ファイルタイプに応じたアイコンを取得
   * @param {string} filename - ファイル名
   * @returns {string} アイコン
   */
  static getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff'].includes(ext)) {
      return '🖼️';
    }
    if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'].includes(ext)) {
      return '🎬';
    }
    if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'].includes(ext)) {
      return '🎵';
    }
    if (['.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl'].includes(ext)) {
      return '🗿';
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
      return '📦';
    }
    
    return '📎';
  }

  /**
   * ファイルサイズ制限チェック
   * @param {Array} files - ファイル情報の配列
   * @param {number} maxSize - 最大ファイルサイズ（バイト）
   * @returns {Array} サイズ制限内のファイル配列
   */
  static filterBySize(files, maxSize) {
    return files.filter(file => file.size <= maxSize);
  }

  /**
   * アップロード完了したファイルを削除
   * @param {Array} files - 削除するファイル情報の配列
   */
  static async deleteUploadedFiles(files) {
    try {
      console.log(`🗑️ アップロード完了したファイルを削除中... (${files.length}個)`);
      
      for (const file of files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`✅ 削除完了: ${file.name}`);
          } else {
            console.log(`⚠️ ファイルが存在しません: ${file.name}`);
          }
        } catch (deleteError) {
          console.error(`❌ ファイル削除エラー (${file.name}):`, deleteError.message);
        }
      }
      
      console.log(`🗑️ ファイル削除処理完了 (${files.length}個)`);
    } catch (error) {
      console.error('❌ ファイル削除処理でエラーが発生しました:', error);
    }
  }

  /**
   * ファイル情報のサマリー作成
   * @param {Array} files - ファイル情報の配列
   * @returns {Object} サマリー情報
   */
  static createSummary(files) {
    if (files.length === 0) {
      return {
        count: 0,
        totalSize: 0,
        types: [],
        icons: ''
      };
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const types = [...new Set(files.map(file => this.getFileIcon(file.name)))];
    const icons = types.join('');

    return {
      count: files.length,
      totalSize,
      types,
      icons
    };
  }

  /**
   * ファイルサイズを人間が読みやすい形式に変換
   * @param {number} bytes - バイト数
   * @returns {string} 読みやすいサイズ表現
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * ファイル拡張子からMIMEタイプを推測
   * @param {string} filename - ファイル名
   * @returns {string} MIMEタイプ
   */
  static getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      // 画像
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.tiff': 'image/tiff',
      
      // 動画
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv',
      '.m4v': 'video/x-m4v',
      
      // 音声
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/x-m4a',
      '.wma': 'audio/x-ms-wma',
      
      // アーカイブ
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = FileProcessor;