const getFileExtension = (filename) => {
    return /[.]/.exec(filename) ? /[^.]+$/.exec(filename)[0] : undefined;
  };

const  onFormatTitle = (name) => {
    return name
      .replace(/\.[^/.]+$/, "")
      .replace(/_/g, " ")
      .replace(/-/g, " ");
  };

const onFormatName = (name) => {
    return name.replace(/\.[^/.]+$/, "");
  };

const onFormatBytes = (bytes, decimals = 1) => {
    if (bytes === 0) return "0 Bytes";

    const k = 1000;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

const removeHyphen = (id) => {
   return id.replace(/-/g, "");
  };

const detectUrlFormat = (url) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Get file extension from URL path
      const extension = getFileExtension(pathname);
      
      // Common file extensions that indicate specific file types
      const fileExtensions = [
        'csv', 'json', 'xml', 'pdf', 'xlsx', 'xls', 'doc', 'docx', 
        'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'gif', 'svg',
        'mp4', 'mp3', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm',
        'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'ppt', 'pptx', 
        'geojson', 'kml', 'kmz', 'shp', 'tsv', 'rdf', 'owl', 'n3', 'ttl'
      ];
      
      // If URL has a specific file extension, return it
      if (extension && fileExtensions.includes(extension.toLowerCase())) {
        return extension.toLowerCase();
      }
      
      // If URL ends with / or has no extension, or common web paths, treat as website
      if (pathname === '/' || 
          pathname === '' || 
          !extension ||
          pathname.includes('/page/') ||
          pathname.includes('/post/') ||
          pathname.includes('/article/') ||
          urlObj.search || // has query parameters
          urlObj.hash) { // has fragment
        return 'website';
      }
      
      // If extension exists but not in our file list, also treat as website
      return 'website';
      
    } catch (error) {
      // If URL parsing fails, default to website
      return 'website';
    }
  };

// Function to check if a file type requires schema parsing (tabular data)
const isTabularDataFormat = (filename) => {
  const extension = getFileExtension(filename);
  if (!extension) return false;
  
  // File formats that contain tabular data and can be parsed by frictionless.js
  const tabularFormats = [
    'csv', 'tsv', 'json', 'xlsx', 'xls', 'ods', 'geojson'
  ];
  
  return tabularFormats.includes(extension.toLowerCase());
};

// Function to get file format from filename
const getFileFormat = (filename) => {
  const extension = getFileExtension(filename);
  return extension ? extension.toLowerCase() : 'unknown';
};

// Function to generate SHA256 hash for files using Web Crypto API
const generateFileHash = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.warn('Failed to generate file hash:', error);
    return null;
  }
};

export {
    getFileExtension,
    onFormatTitle,
    onFormatName,
    onFormatBytes,
    removeHyphen,
    detectUrlFormat,
    isTabularDataFormat,
    getFileFormat,
    generateFileHash,
}