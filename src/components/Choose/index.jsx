import React, { useState } from "react";
import PropTypes from "prop-types";
import InputFile from "../InputFile";
import InputUrl from "../InputUrl";
import './Choose.css'

const Choose = ({ onChangeUrl, onChangeHandler, resetUploadState }) => {
  const [uploadOption, setUploadOption] = useState(false);

  const handleBack = () => {
    setUploadOption(false);
    // Reset the upload state when going back
    if (resetUploadState) {
      resetUploadState();
    }
  };

  return (
    <div className="upload-choose">
      {uploadOption ? (
        <>
          <div className="upload-option-header">
            <button 
              className="back-btn" 
              onClick={handleBack}
              type="button"
            >
              ← Volver
            </button>
            <span className="upload-option-title">
              {uploadOption === "file" ? "Subir archivo" : "Enlazar archivo online"}
            </span>
          </div>
          {uploadOption === "file" && (
            <InputFile onChangeHandler={onChangeHandler} />
          )}
          {uploadOption === "url" && <InputUrl onChangeUrl={onChangeUrl} />}
        </>
      ) : (
        <div>
          <button className="choose-btn" onClick={() => setUploadOption("file")}>Choose a file to Upload </button>
          <p className="choose-text">OR</p>
          <button className="choose-btn" onClick={() => setUploadOption("url")}>Link a file already online</button>
        </div>
      )}
    </div>
  );
};

Choose.propTypes = {
  onChangeUrl: PropTypes.func.isRequired,
  onChangeHandler: PropTypes.func.isRequired,
  resetUploadState: PropTypes.func,
};

export default Choose;
