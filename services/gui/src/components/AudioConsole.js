import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  LinearProgress,
  Alert,
  Snackbar,
  Stack,
  Typography,
  IconButton,
  Tooltip
} from "@mui/material";
import axios from "axios";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import ReplayIcon from "@mui/icons-material/Replay";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8500";
const API_KEY = process.env.REACT_APP_API_KEY || "";

function AudioConsole({ onResult }) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState("");

  // Future state stubs
  const [sessions, setSessions] = useState([]);
  const [quality, setQuality] = useState({ sampleRate: 44100, bitRate: 128000 });
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const [visualType, setVisualType] = useState("waveform");
  const [audioFormat, setAudioFormat] = useState("webm");
  const [devMode] = useState(false); // flag for dev/stub features

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);

  // Start Recording
  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices) {
      setError("MediaDevices API not supported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: `audio/${audioFormat}` });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: `audio/${audioFormat}` });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        // store session stub
        setSessions(prev => [...prev, blob]);
      };

      mediaRecorder.start();
      setRecording(true);
      startVisualization(stream);
      showTemporaryMessage("Recording started");
    } catch (e) {
      setError(e.message);
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      stopVisualization();
      setRecording(false);
      showTemporaryMessage("Recording stopped");
    }
  };

  // Reset recording
  const resetRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
    setSessions([]);
  };

  // Merge sessions stub
  const mergeSessions = () => {
    // TODO: merge multiple session blobs into one
  };

  // Analyze AI stub
  const analyzeBeforeUpload = async () => {
    // TODO: send audio to AI for analysis/enhancement
  };

  // Upload Audio
  const handleUpload = async () => {
    if (!audioBlob) return setError("No audio recorded to upload");

    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `audio.${audioFormat}`);
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: e => {
          setUploadProgress(Math.round((e.loaded * 100) / e.total));
        },
      });

      onResult({ type: "audio", data: response.data, file: `audio.${audioFormat}` });
      showTemporaryMessage("Upload successful");
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setUploading(false);
    }
  };

  // Visualization
  const startVisualization = (stream) => {
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 2048;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#38c0fc";
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

  const stopVisualization = () => {
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    animationIdRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const showTemporaryMessage = (msg) => {
    setSnackbarMsg(msg);
    setSnackbarOpen(true);
  };

  useEffect(() => {
    return () => {
      stopVisualization();
      if (mediaRecorderRef.current) mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <Box sx={{ m: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {!recording ? (
          <Tooltip title="Start Recording">
            <Button variant="contained" startIcon={<MicIcon />} onClick={startRecording} disabled={uploading}>
              تسجيل
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Stop Recording">
            <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={stopRecording}>
              إيقاف
            </Button>
          </Tooltip>
        )}
        <Button variant="outlined" startIcon={<ReplayIcon />} onClick={resetRecording} disabled={recording || uploading}>
          إعادة تسجيل
        </Button>
        <Button variant="contained" onClick={handleUpload} disabled={!audioBlob || uploading || recording}>
          رفع
        </Button>
      </Stack>

      {uploading && <LinearProgress variant="determinate" value={uploadProgress} sx={{ mt: 1 }} />}

      <Box sx={{ mt: 2 }}>
        <canvas ref={canvasRef} width={400} height={100} style={{ border: "1px solid #ccc", borderRadius: 4 }} />
      </Box>

      {audioUrl && (
        <Box sx={{ mt: 2 }}>
          <audio ref={audioRef} controls src={audioUrl} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMsg}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

export default AudioConsole;