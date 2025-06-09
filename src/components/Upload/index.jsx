import React from "react";
import * as data from "frictionless.js";
import toArray from "stream-to-array";
import ProgressBar from "../ProgressBar";
import { onFormatBytes, detectUrlFormat, isTabularDataFormat, getFileFormat, generateFileHash } from "../../utils";
import Choose from "../Choose";
import formatData from "../../db/resource_formats.json";
import "./Upload.css";

// Alternative approach: Create a file-like object that extends the original file
const createFileWithHashAlternative = (originalFile) => {
  if (!originalFile || typeof originalFile !== 'object') {
    console.error('createFileWithHashAlternative: Invalid file object provided');
    return null;
  }

  // Create a new object that has all the properties of the original file
  const fileWithHash = Object.create(Object.getPrototypeOf(originalFile));
  
  // Copy all properties from the original file
  Object.getOwnPropertyNames(originalFile).forEach(prop => {
    const descriptor = Object.getOwnPropertyDescriptor(originalFile, prop);
    if (descriptor) {
      Object.defineProperty(fileWithHash, prop, descriptor);
    }
  });
  
  // Add the hash method
  fileWithHash.hash = async (algorithm) => {
    try {
      return await generateFileHash(originalFile);
    } catch (error) {
      console.error('Error generating file hash:', error);
      return null;
    }
  };

  return fileWithHash;
};

// Create a proxy that adds hash method to a file without modifying its structure
const createFileWithHash = (originalFile) => {
  // Ensure originalFile exists and has the expected properties
  if (!originalFile || typeof originalFile !== 'object') {
    console.error('createFileWithHash: Invalid file object provided');
    return null;
  }

  return new Proxy(originalFile, {
    get(target, prop, receiver) {
      if (prop === 'hash') {
        return async (algorithm) => {
          try {
            return await generateFileHash(originalFile);
          } catch (error) {
            console.error('Error generating file hash in proxy:', error);
            return null;
          }
        };
      }
      
      // Special handling for 'type' property to ensure it's always available
      if (prop === 'type') {
        const value = Reflect.get(target, prop, target);
        return value || 'application/octet-stream'; // Return default MIME type if type is undefined
      }
      
      // Handle other common properties that might be accessed
      if (prop === 'name') {
        const value = Reflect.get(target, prop, target);
        return value || 'unknown-file';
      }
      
      if (prop === 'size') {
        const value = Reflect.get(target, prop, target);
        return typeof value === 'number' ? value : 0;
      }
      
      // For methods, we need to bind them to the original target to avoid "Illegal invocation"
      const value = Reflect.get(target, prop, target); // Use target as receiver to maintain context
      
      // If it's a function, bind it to the original target
      if (typeof value === 'function') {
        return value.bind(target);
      }
      
      return value;
    },
    has(target, prop) {
      if (prop === 'hash') {
        return true;
      }
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      const keys = Reflect.ownKeys(target);
      if (!keys.includes('hash')) {
        keys.push('hash');
      }
      return keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'hash') {
        return {
          enumerable: true,
          configurable: true,
          writable: false
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    set(target, prop, value, receiver) {
      // Prevent setting the hash property
      if (prop === 'hash') {
        return false;
      }
      return Reflect.set(target, prop, value, target);
    }
  });
};

class Upload extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      datasetId: props.datasetId,
      selectedFile: null,
      selectedUrl: "",
      fileSize: 0,
      formattedSize: "0 KB",
      start: "",
      loaded: 0,
      success: false,
      error: false,
      fileExists: false,
      loading: false,
      timeRemaining: 0,
      uploadType: "", // "file" or "url"
      detectedFormat: "", // automatically detected format
      manualFormat: "", // manually selected format
    };
  }

  resetUploadState = () => {
    this.setState({
      selectedFile: null,
      selectedUrl: "",
      fileSize: 0,
      formattedSize: "0 KB",
      start: "",
      loaded: 0,
      success: false,
      error: false,
      fileExists: false,
      loading: false,
      timeRemaining: 0,
      uploadType: "",
      detectedFormat: "",
      manualFormat: "",
    });

    // Also reset the resource metadata in the parent component
    this.props.metadataHandler({});
    
    // Reset upload status
    this.props.handleUploadStatus({
      loading: false,
      success: false,
      error: false,
    });
  };

  onChangeHandler = async (event) => {
    let { formattedSize, selectedFile } = this.state;

    if (event.target.files.length > 0) {
      selectedFile = event.target.files[0];
      
      // Check if this is a tabular data format that can be parsed by frictionless.js
      const isTabular = isTabularDataFormat(selectedFile.name);
      const fileFormat = getFileFormat(selectedFile.name);
      
      let resourceMetadata = {
        name: selectedFile.name,
        title: selectedFile.name,
        format: fileFormat,
        size: selectedFile.size
      };

      if (isTabular) {
        // For tabular data, use frictionless.js to parse schema
        try {
          const file = data.open(selectedFile);
          try {
            await file.addSchema();
            resourceMetadata = {
              ...file.descriptor,
              format: fileFormat
            };
          } catch (e) {
            console.warn("Schema parsing failed, continuing without schema:", e);
            // Continue without schema if parsing fails
            resourceMetadata = {
              ...resourceMetadata,
              schema: { fields: [] }
            };
          }
          formattedSize = onFormatBytes(file.size);
          const hash = await file.hash('sha256');
          resourceMetadata.hash = hash;
        } catch (e) {
          console.warn("Frictionless.js processing failed, using basic metadata:", e);
          formattedSize = onFormatBytes(selectedFile.size);
          // For non-tabular files or when frictionless fails, create basic metadata
          resourceMetadata = {
            ...resourceMetadata,
            schema: { fields: [] }
          };
          // Try to generate hash for failed tabular files
          const hash = await generateFileHash(selectedFile);
          if (hash) {
            resourceMetadata.hash = hash;
          }
        }
      } else {
        // For non-tabular files (PDF, images, documents, etc.), create basic metadata
        formattedSize = onFormatBytes(selectedFile.size);
        resourceMetadata = {
          ...resourceMetadata,
          schema: { fields: [] }
        };
        // Generate hash for non-tabular files
        const hash = await generateFileHash(selectedFile);
        if (hash) {
          resourceMetadata.hash = hash;
        }
      }

      this.props.metadataHandler(resourceMetadata);
    }

    this.setState({
      selectedFile,
      selectedUrl: "",
      loaded: 0,
      success: false,
      fileExists: false,
      error: false,
      formattedSize,
      uploadType: "file",
    });

    await this.onClickHandler();
  };

  onChangeUrl = async (event) => {
    const url = event.target.value.trim();
    
    if (!url) {
      this.setState({
        selectedUrl: "",
        success: false,
        error: false,
        uploadType: "",
        detectedFormat: "",
        manualFormat: "",
      });
      this.props.handleUploadStatus({
        loading: false,
        success: false,
        error: false,
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch (error) {
      console.error("Invalid URL:", error);
      this.setState({
        selectedUrl: url,
        selectedFile: null,
        loading: false,
        success: false,
        error: true,
        uploadType: "url",
        detectedFormat: "",
        manualFormat: "",
      });

      this.props.handleUploadStatus({
        loading: false,
        success: false,
        error: true,
      });
      return;
    }

    // Detect format automatically based on URL
    const detectedFormat = detectUrlFormat(url);
    
    this.setState({
      selectedUrl: url,
      selectedFile: null,
      loading: false,
      success: true,
      error: false,
      uploadType: "url",
      formattedSize: "URL Resource",
      fileSize: 0,
      detectedFormat: detectedFormat,
      manualFormat: detectedFormat, // Initialize manual format with detected format
    });

    this.props.handleUploadStatus({
      loading: false,
      success: true,
      error: false,
    });

    const resourceName = url.split('/').pop() || 'resource-from-url';
    
    const urlResource = {
      url: url,
      name: resourceName,
      title: resourceName,
      format: detectedFormat,
      // No hash, size, or schema for URL resources
      // These will be handled differently in the backend
    };

    this.props.metadataHandler(urlResource);
  };

  onFormatChange = (event) => {
    const newFormat = event.target.value;
    this.setState({
      manualFormat: newFormat,
    });

    // Update the resource metadata with the new format
    const { selectedUrl } = this.state;
    const resourceName = selectedUrl.split('/').pop() || 'resource-from-url';
    
    const urlResource = {
      url: selectedUrl,
      name: resourceName,
      title: resourceName,
      format: newFormat,
    };

    this.props.metadataHandler(urlResource);
  };

  onUploadProgress = (progressEvent) => {
    this.onTimeRemaining(progressEvent.loaded);
    this.setState({
      loaded: (progressEvent.loaded / progressEvent.total) * 100,
    });
  };

  onTimeRemaining = (progressLoaded) => {
    const end = new Date().getTime();
    const duration = (end - this.state.start) / 1000;
    const bps = progressLoaded / duration;
    const kbps = bps / 1024;
    const timeRemaining = (this.state.fileSize - progressLoaded) / kbps;

    this.setState({
      timeRemaining: timeRemaining / 1000,
    });
  };

  onClickHandler = async () => {
    const start = new Date().getTime();
    const { selectedFile } = this.state;
    const { client } = this.props;

    if (!selectedFile) {
      console.error("No file selected");
      return;
    }

    console.log("Selected file:", selectedFile);
    console.log("File type:", selectedFile.type);
    console.log("File name:", selectedFile.name);
    console.log("File size:", selectedFile.size);

    // Check if this is a tabular data format
    const isTabular = isTabularDataFormat(selectedFile.name);
    
    let resource;
    let fileSize = selectedFile.size;

    if (isTabular) {
      // For tabular data, use frictionless.js
      try {
        resource = data.open(selectedFile);
        fileSize = resource.size;
        console.log("Using frictionless.js resource:", resource);
      } catch (e) {
        console.warn("Frictionless.js failed, creating proxy with hash:", e);
        // Create a proxy with hash method for failed tabular files
        resource = createFileWithHash(selectedFile);
        if (!resource) {
          console.error("Failed to create proxy for tabular file");
          this.setState({ error: true, loading: false });
          this.props.handleUploadStatus({ loading: false, success: false, error: true });
          return;
        }
        console.log("Created proxy for failed tabular file:", resource);
        console.log("Proxy type:", resource.type);
        console.log("Proxy has hash:", 'hash' in resource);
      }
    } else {
      // For non-tabular files (PDF, images, documents, etc.), create a proxy with hash
      console.log("Creating proxy for non-tabular file");
      resource = createFileWithHash(selectedFile);
      if (!resource) {
        console.error("Proxy creation failed, trying alternative approach");
        resource = createFileWithHashAlternative(selectedFile);
        if (!resource) {
          console.error("Failed to create file wrapper for non-tabular file");
          this.setState({ error: true, loading: false });
          this.props.handleUploadStatus({ loading: false, success: false, error: true });
          return;
        }
        console.log("Created alternative file wrapper:", resource);
      } else {
        console.log("Created proxy for non-tabular file:", resource);
      }
      console.log("Resource type:", resource.type);
      console.log("Resource size:", resource.size);
      console.log("Resource has hash:", 'hash' in resource);
      console.log("Resource constructor:", resource.constructor.name);
    }

    // Additional validation to ensure resource has required properties
    if (!resource || 
        (typeof resource.format === 'undefined' && typeof resource.type === 'undefined')) {
      console.error("Resource object is invalid or missing format/type property");
      this.setState({ error: true, loading: false });
      this.props.handleUploadStatus({ loading: false, success: false, error: true });
      return;
    }

    console.log("Final resource object:", resource);
    console.log("Resource type:", resource.type);
    console.log("Resource format:", resource.format);
    console.log("Resource size:", resource.size);
    console.log("Resource constructor:", resource.constructor.name);
    console.log("Resource instanceof File:", resource instanceof File);

    this.setState({
      fileSize: fileSize,
      start,
      loading: true,
    });

    this.props.handleUploadStatus({
      loading: true,
      error: false,
      success: false,
    });

    // Use client to upload file to the storage and track the progress
    client
      .pushBlob(resource, this.onUploadProgress)
      .then((response) => {
        console.log("Upload successful:", response);
        this.setState({
          success: true,
          loading: false,
          fileExists: ! response,
          loaded: 100
        });
        this.props.handleUploadStatus({
          loading: false,
          success: true,
        });
      })
      .catch((error) => {
        console.error("Upload failed with error: " + error);
        console.error("Error details:", error);
        this.setState({ error: true, loading: false });
        this.props.handleUploadStatus({
          loading: false,
          success: false,
          error: true,
        });
      });
  };

  render() {
    const {
      success,
      fileExists,
      error,
      timeRemaining,
      selectedFile,
      selectedUrl,
      formattedSize,
      uploadType,
      loading,
      detectedFormat,
      manualFormat,
    } = this.state;

    return (
      <div className="upload-area">
        <Choose
          onChangeHandler={this.onChangeHandler}
          onChangeUrl={this.onChangeUrl}
          resetUploadState={this.resetUploadState}
        />
        <div className="upload-area__info">
          {(selectedFile || selectedUrl) && (
            <>
              <ul className="upload-list">
                <li className="list-item">
                  <div className="upload-list-item">
                    <div>
                      <p className="upload-file-name">
                        {uploadType === "file" ? selectedFile.name : selectedUrl}
                      </p>
                      <p className="upload-file-size">{formattedSize}</p>
                      {uploadType === "url" && (
                        <div className="format-selector">
                          <label htmlFor="format-select" className="format-label">
                            Resource Type:
                          </label>
                          <select
                            id="format-select"
                            className="format-select"
                            value={manualFormat}
                            onChange={this.onFormatChange}
                          >
                            {formatData.map((item) => (
                              <option key={`format-${item[0]}`} value={item[0].toLowerCase()}>
                                {item[0]} - {item[1]}
                              </option>
                            ))}
                          </select>
                          {detectedFormat && (
                            <p className="detected-format">
                              Auto-detected: {detectedFormat.toUpperCase()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      {uploadType === "file" && (
                        <ProgressBar
                          progress={Math.round(this.state.loaded)}
                          size={50}
                          strokeWidth={5}
                          circleOneStroke="#d9edfe"
                          circleTwoStroke={"#7ea9e1"}
                          timeRemaining={timeRemaining}
                        />
                      )}
                      {uploadType === "url" && loading && (
                        <div className="url-loading">Processing URL...</div>
                      )}
                    </div>
                  </div>
                </li>
              </ul>
              <h2 className="upload-message">
                {success && !fileExists && !error && 
                  (uploadType === "file" ? "File uploaded successfully" : "URL processed successfully")}
                {fileExists && "File uploaded successfully"}
                {error && (uploadType === "file" ? "Upload failed" : "URL processing failed")}
              </h2>
            </>
          )}
        </div>
      </div>
    );
  }
}

export default Upload;
