import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Button,
  Alert,
  Typography,
  LinearProgress,
  Snackbar,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8500";
const API_KEY = process.env.REACT_APP_API_KEY || "";

function FileUploadConsole({ onResult }) {
  const [files, setFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [snackbarMsg, setSnackbarMsg] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Handle file selection
  const handleChange = (e) => {
    const selected = Array.from(e.target.files);
    const newFiles = selected.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      id: `${file.name}-${Date.now()}`,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    setErrors({});
  };

  // Drag & Drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    const newFiles = dropped.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      id: `${file.name}-${Date.now()}`,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    setErrors({});
  };
  const handleDragOver = (e) => e.preventDefault();

  // Upload a single file
  const uploadFile = async (fileObj) => {
    const { file, id } = fileObj;
    setUploadingFiles((prev) => ({ ...prev, [id]: 0 }));
    const formData = new FormData();
    formData.append("file", file);

    try {
      const r = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadingFiles((prev) => ({ ...prev, [id]: percent }));
        },
      });
      onResult({ type: "file", data: r.data, file: file.name });
      setSnackbarMsg(`تم رفع الملف: ${file.name}`);
      setSnackbarOpen(true);
      setUploadingFiles((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [id]: e?.response?.data?.detail || e.message,
      }));
      setUploadingFiles((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  // Upload all files
  const handleUploadAll = () => {
    files.forEach((fileObj) => uploadFile(fileObj));
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, [files]);

  // Remove single file
  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setUploadingFiles((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Preview rendering
  const renderPreview = (fileObj) => {
    const { file, previewUrl, id } = fileObj;
    if (file.type.startsWith("image/")) {
      return <img src={previewUrl} alt={file.name} style={{ maxWidth: 120 }} />;
    } else if (file.type.startsWith("video/")) {
      return (
        <video src={previewUrl} controls style={{ maxWidth: 180 }} />
      );
    } else if (file.type.startsWith("audio/")) {
      return <audio src={previewUrl} controls />;
    } else if (
      file.type === "application/json" ||
      file.name.endsWith(".json")
    ) {
      return <Typography variant="body2">{file.name} (JSON)</Typography>;
    } else {
      return <Typography variant="body2">{file.name}</Typography>;
    }
  };

  return (
    <Box
      ref={dropRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      sx={{
        border: "2px dashed #ccc",
        padding: 2,
        borderRadius: 2,
        position: "relative",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="*/*"
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <Button
        variant="contained"
        onClick={() => inputRef.current.click()}
        sx={{ mb: 1 }}
      >
        اختر ملفات
      </Button>
      {files.length > 0 && (
        <Button
          variant="contained"
          color="success"
          onClick={handleUploadAll}
          sx={{ ml: 1, mb: 1 }}
        >
          رفع كل الملفات
        </Button>
      )}

      {files.map((fileObj) => (
        <Box
          key={fileObj.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1,
            border: "1px solid #ddd",
            p: 1,
            borderRadius: 1,
          }}
        >
          <Box sx={{ flex: 1 }}>{renderPreview(fileObj)}</Box>
          {uploadingFiles[fileObj.id] !== undefined && (
            <Box sx={{ width: 120 }}>
              <LinearProgress
                variant="determinate"
                value={uploadingFiles[fileObj.id]}
              />
              <Typography variant="caption">
                {uploadingFiles[fileObj.id]}%
              </Typography>
            </Box>
          )}
          {errors[fileObj.id] && (
            <Alert severity="error">{errors[fileObj.id]}</Alert>
          )}
          <IconButton onClick={() => removeFile(fileObj.id)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMsg}
        action={
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={() => setSnackbarOpen(false)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Box>
  );
}

export default FileUploadConsole;