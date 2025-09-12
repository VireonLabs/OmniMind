import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  MenuItem,
  IconButton,
  Stack,
  Tooltip,
  Chip,
  Snackbar,
} from "@mui/material";
import { FixedSizeList as List } from "react-window";
import axios from "axios";
import ReplayIcon from "@mui/icons-material/Replay";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { v4 as uuidv4 } from "uuid";
import fuzzysort from "fuzzysort";
import diff from "diff";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8500";
const API_KEY = process.env.REACT_APP_API_KEY || "";
const MODALITIES = ["text", "audio", "file"];

const DiffPreview = memo(({ diffText, onCopy }) => {
  const lines = diffText.split("\n");
  const maxVisibleLines = 10;
  const height = Math.min(lines.length * 22, maxVisibleLines * 22);

  const Row = ({ index, style }) => {
    const line = lines[index];
    const diffs = diff.diffWords(line, line);
    return (
      <Typography variant="body2" component="div" style={{ ...style, whiteSpace: "pre-wrap" }}>
        {diffs.map((part, idx) => (
          <span
            key={idx}
            style={{
              backgroundColor: part.added ? "#c8f0c8" : part.removed ? "#f0c8c8" : "transparent",
              color: part.added ? "#006400" : part.removed ? "#8b0000" : "#000",
              fontWeight: part.added || part.removed ? "bold" : "normal",
            }}
          >
            {part.value}
          </span>
        ))}
      </Typography>
    );
  };

  return (
    <Box
      sx={{
        mt: 1,
        p: 1,
        border: "1px dashed #666",
        borderRadius: 2,
        backgroundColor: "#fdfdfd",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
        "&:hover": { backgroundColor: "#f0f8ff" },
      }}
    >
      <Tooltip title="Copy to clipboard" sx={{ alignSelf: "flex-end" }}>
        <IconButton size="small" onClick={onCopy} sx={{ mb: 0.5, alignSelf: "flex-end" }}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box sx={{ flex: 1, overflowY: "auto", maxHeight: height }}>
        <List height={height} itemCount={lines.length} itemSize={22} width="100%">
          {Row}
        </List>
      </Box>
    </Box>
  );
});

function ConsolePanel({ onResult, centerSnapshots }) {
  const [input, setInput] = useState("");
  const [modality, setModality] = useState("text");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [diffPreview, setDiffPreview] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [streak, setStreak] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const inputRef = useRef(null);
  const diffTextRef = useRef("");

  useEffect(() => {
    const savedHistory = localStorage.getItem("consoleHistory");
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  useEffect(() => {
    localStorage.setItem("consoleHistory", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (input) {
      if (input.includes("http") && input.match(/\.(mp3|wav|ogg)$/)) setModality("audio");
      else if (input.includes("http") && input.match(/\.(jpg|png|gif)$/)) setModality("file");
      else setModality("text");
    }
  }, [input]);

  const shortTermMemory = history.slice(-10);

  const generateSmartSuggestions = (textInput) => {
    const suggestions = [];
    history.forEach(h => {
      const res = fuzzysort.go(textInput, [h.input], { limit: 3 });
      res.forEach(r => suggestions.push(r.target));
    });
    Object.values(centerSnapshots || {}).forEach(tabSnapshots => {
      tabSnapshots.forEach(snapList => {
        snapList.forEach(res => {
          if (res.input.includes(textInput) && res.input !== textInput) suggestions.push(res.input);
        });
      });
    });
    return [...new Set(suggestions)].slice(0, 5);
  };

  const generateLivePredictions = (textInput, shortMemory) => {
    const preds = shortMemory
      .filter(h => h.input.includes(textInput))
      .map(h => `${h.input} → predicted output`);
    return preds.length ? preds : ["No live predictions"];
  };

  useEffect(() => {
    if (!input) {
      setAiSuggestions([]);
      setPreview(null);
      setDiffPreview(null);
      diffTextRef.current = "";
      return;
    }

    const updatedSuggestions = generateSmartSuggestions(input);
    setAiSuggestions(updatedSuggestions);

    const livePreds = generateLivePredictions(input, shortTermMemory);
    setPreview(`Live Predictions: ${livePreds.join(", ")}`);

    if (updatedSuggestions.length > 0) {
      const firstSuggestion = updatedSuggestions[0];
      diffTextRef.current = firstSuggestion;

      setDiffPreview(
        <DiffPreview
          diffText={firstSuggestion}
          onCopy={() => {
            navigator.clipboard.writeText(diffTextRef.current)
              .then(() => {
                setSnackbarMessage("Copied to clipboard!");
                setSnackbarOpen(true);
              })
              .catch(() => {
                setSnackbarMessage("Failed to copy.");
                setSnackbarOpen(true);
              });
          }}
        />
      );
    } else {
      setDiffPreview(null);
      diffTextRef.current = "";
    }
  }, [input, history, centerSnapshots]);

  const handleSend = useCallback(async (overrideInput = null, overrideModality = null) => {
    const actualInput = overrideInput ?? input;
    const actualModality = overrideModality ?? modality;
    if (!actualInput) return;

    setError("");
    setLoading(true);
    let attempt = 0;
    const maxRetries = 3;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        const response = await axios.post(
          `${API_URL}/encode`,
          { input: actualInput, modality: actualModality },
          { headers: { "X-API-KEY": API_KEY }, timeout: 10000 }
        );

        const result = {
          id: uuidv4(),
          type: actualModality,
          data: response.data,
          input: actualInput,
          timestamp: new Date().toISOString(),
          context: [...history],
        };

        onResult(result);
        setHistory(prev => [...prev.slice(-19), { input: actualInput, modality: actualModality, timestamp: new Date().toISOString() }]);
        setInput("");
        setRetryCount(0);
        setStreak(s => s + 1);
        success = true;
      } catch (err) {
        attempt++;
        setRetryCount(attempt);
        if (attempt > maxRetries) {
          setError(err?.response?.data?.detail || err.message || "Unknown error");
          setStreak(0);
        }
      }
    }
    setLoading(false);
  }, [input, modality, history, onResult]);

  const handleEnhanceInput = async () => {
    if (!input) return;
    setLoading(true);
    try { setInput(`[AI-Enhanced] ${input}`); }
    finally { setLoading(false); }
  };

  const handleResendHistory = (item) => handleSend(item.input, item.modality);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "Enter") handleSend();
      if (e.key === "ArrowUp" && history.length > 0) setInput(history[history.length - 1].input);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSend, history]);

  const renderAISuggestion = ({ index, style }) => {
    const s = aiSuggestions[index];
    return (
      <Box style={style} key={index}>
        <Button fullWidth onClick={() => setInput(s)} variant="outlined" size="small">
          {s}
        </Button>
      </Box>
    );
  };

  const renderHistoryItem = ({ index, style }) => {
    const item = [...history].reverse()[index];
    return (
      <Box style={style} key={item.timestamp}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box onClick={() => handleResendHistory(item)} sx={{ flex: 1, cursor: "pointer", p: 0.5 }}>
            <Typography variant="body2">{item.input}</Typography>
            <Typography variant="caption" color="text.secondary">
              {`${item.modality} - ${new Date(item.timestamp || Date.now()).toLocaleTimeString()}`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => handleResendHistory(item)}>
            <ReplayIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%", overflowY: "auto", p: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          inputRef={inputRef}
          label="Input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          fullWidth
          disabled={loading}
        />
        <TextField
          select
          label="Modality"
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          disabled={loading}
          sx={{ width: 120 }}
        >
          {MODALITIES.map((m) => (
            <MenuItem key={m} value={m}>{m}</MenuItem>
          ))}
        </TextField>
        <Button
          onClick={() => handleSend()}
          disabled={loading || !input}
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? "Sending..." : "إرسال"}
        </Button>
        <Tooltip title="Enhance Input / Suggest">
          <IconButton onClick={handleEnhanceInput} disabled={loading}>
            <LightbulbIcon />
          </IconButton>
        </Tooltip>
        {streak > 0 && <Chip label={`Streak: ${streak}`} color="success" size="small" />}
      </Stack>

      {preview && <Typography variant="body2" color="text.secondary">{preview}</Typography>}

      {diffPreview}

      {aiSuggestions.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2">AI Suggestions:</Typography>
          <List
            height={Math.min(5, aiSuggestions.length) * 36}
            itemCount={aiSuggestions.length}
            itemSize={36}
            width="100%"
          >
            {renderAISuggestion}
          </List>
        </Box>
      )}

      {error && <Alert severity="error">{error} {retryCount > 0 && `(Attempt ${retryCount})`}</Alert>}

      {history.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2">History & Timeline</Typography>
          <List
            height={Math.min(6, history.length) * 50}
            itemCount={history.length}
            itemSize={50}
            width="100%"
          >
            {renderHistoryItem}
          </List>
        </Box>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

export default ConsolePanel;