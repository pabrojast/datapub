import React from "react";
import * as data from "frictionless.js";
import toArray from "stream-to-array";
import ProgressBar from "../ProgressBar";
import { onFormatBytes } from "../../utils";
import Choose from "../Choose";

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
    };
  }

  onChangeHandler = async (event) => {
    let { formattedSize, selectedFile } = this.state;

    if (event.target.files.length > 0) {
      selectedFile = event.target.files[0];
      const file = data.open(selectedFile);
      try {
        await file.addSchema();
      } catch (e) {
        console.warn(e);
      }
      formattedSize = onFormatBytes(file.size);
      const hash = await file.hash('sha256');
      this.props.metadataHandler(Object.assign(file.descriptor, { hash }));
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
      });
      this.props.handleUploadStatus({
        loading: false,
        success: false,
        error: false,
      });
      return;
    }

    this.setState({
      selectedUrl: url,
      selectedFile: null,
      loading: true,
      success: false,
      error: false,
      uploadType: "url",
    });

    this.props.handleUploadStatus({
      loading: true,
      success: false,
      error: false,
    });

    try {
      // Validate URL and get resource metadata
      const resource = await data.open(url);
      await resource.addSchema();
      
      const formattedSize = onFormatBytes(resource.size);
      const hash = await resource.hash('sha256');
      
      this.setState({
        formattedSize,
        fileSize: resource.size,
        loading: false,
        success: true,
        error: false,
      });

      this.props.handleUploadStatus({
        loading: false,
        success: true,
        error: false,
      });

      this.props.metadataHandler(Object.assign(resource.descriptor, { 
        hash,
        url: url,
        name: url.split('/').pop() || 'resource-from-url'
      }));

    } catch (error) {
      console.error("URL processing failed:", error);
      this.setState({
        loading: false,
        success: false,
        error: true,
      });

      this.props.handleUploadStatus({
        loading: false,
        success: false,
        error: true,
      });
    }
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

    const resource = data.open(selectedFile);

    this.setState({
      fileSize: resource.size,
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
    } = this.state;

    return (
      <div className="upload-area">
        <Choose
          onChangeHandler={this.onChangeHandler}
          onChangeUrl={this.onChangeUrl}
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
