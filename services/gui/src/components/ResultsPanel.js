import React, { useState, useMemo, Suspense, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Snackbar,
  CircularProgress,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import DownloadIcon from "@mui/icons-material/Download";
import ReactJson from "react-json-view";
import { saveAs } from "file-saver";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { v4 as uuidv4 } from "uuid";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker.entry";

// Lazy load PDF components
const { Document, Page } = React.lazy(() => import("react-pdf/dist/esm/entry.webpack"));

/* =====================================
   PDFWorker for generating thumbnails
   ===================================== */
const generateThumbnail = async (pdfData, pageNum) => {
  const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
  const pg = await pdfDoc.getPage(pageNum);
  const viewport = pg.getViewport({ scale: 0.2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL();
};

/* =====================================
   Advanced PDFViewer Component
   ===================================== */
const PDFViewer = ({ file }) => {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [thumbnails, setThumbnails] = useState({});
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const THUMB_BUFFER = 5;

  const loadThumbnailsRange = useCallback(async (start, end) => {
    if (!file) return;
    setLoadingThumbs(true);
    try {
      const loadingTask = pdfjsLib.getDocument(file);
      const pdfDoc = await loadingTask.promise;
      setNumPages(Math.min(pdfDoc.numPages, 5000));
      const maxPages = Math.min(pdfDoc.numPages, 5000);
      const newThumbs = { ...thumbnails };

      for (let i = Math.max(1, start); i <= Math.min(end, maxPages); i++) {
        if (!newThumbs[i]) {
          newThumbs[i] = await generateThumbnail(file, i);
        }
      }
      setThumbnails(newThumbs);
    } catch (err) {
      console.error("PDF thumbnail generation failed:", err);
    }
    setLoadingThumbs(false);
  }, [file, thumbnails]);

  useEffect(() => {
    loadThumbnailsRange(page - THUMB_BUFFER, page + THUMB_BUFFER);
  }, [page, loadThumbnailsRange]);

  const nextPage = () => setPage((prev) => Math.min(prev + 1, numPages));
  const prevPage = () => setPage((prev) => Math.max(prev - 1, 1));

  return (
    <Box sx={{ maxHeight: 400, overflow: "auto" }}>
      <Suspense fallback={<CircularProgress />}>
        <Document file={file} onLoadSuccess={({ numPages }) => setNumPages(Math.min(numPages, 5000))}>
          <Page pageNumber={page} width={250} />
        </Document>
      </Suspense>

      <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mt: 1 }}>
        <Button size="small" onClick={prevPage} disabled={page <= 1}>
          السابق
        </Button>
        <Typography variant="body2" sx={{ color: "#fff" }}>
          صفحة {page} / {numPages}
        </Typography>
        <Button size="small" onClick={nextPage} disabled={page >= numPages}>
          التالي
        </Button>
      </Box>

      {loadingThumbs && <CircularProgress size={24} sx={{ mt: 1 }} />}

      {Object.keys(thumbnails).length > 0 && (
        <Box sx={{ display: "flex", overflowX: "auto", mt: 1 }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((i) => (
            <img
              key={i}
              src={thumbnails[i]}
              width={50}
              style={{
                margin: "2px",
                border: i === page ? "2px solid #38c0fc" : "1px solid #ccc",
                cursor: "pointer",
                opacity: thumbnails[i] ? 1 : 0.3,
              }}
              onClick={() => setPage(i)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

/* =====================================
   Main ResultsPanel Component
   ===================================== */
function ResultsPanel({ results, liveActivity }) {
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [snackbarMsg, setSnackbarMsg] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState([]);
  const overlayRef = useRef(null);

  const tabs = ["All", "Text", "Audio", "Video", "File", "Markdown", "PDF", "CSV", "Other"];

  const handleTabChange = (e, newValue) => setActiveTab(newValue);

  const handleCopy = (data) => {
    navigator.clipboard.writeText(typeof data === "object" ? JSON.stringify(data, null, 2) : data);
    setSnackbarMsg("تم نسخ النتيجة!");
    setSnackbarOpen(true);
  };

  const handleExport = () => {
    const exportData = filteredResults.map((r) => ({
      type: r.type,
      input: r.input || r.file?.name || "",
      data: r.data,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    saveAs(blob, "results.json");
    setSnackbarMsg("تم تصدير النتائج كـ JSON!");
    setSnackbarOpen(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const previews = files.map((file) => {
      const url = URL.createObjectURL(file);
      let type = "File";
      if (file.type.startsWith("image/")) type = "Image";
      else if (file.type.startsWith("audio/")) type = "Audio";
      else if (file.type.startsWith("video/")) type = "Video";
      else if (file.type === "application/pdf") type = "PDF";
      else if (file.type === "text/markdown") type = "Markdown";
      return { id: uuidv4(), type, input: file.name, data: url, file };
    });
    setDraggedFiles((prev) => [...prev, ...previews]);
  };

  const handleDragOver = (e) => e.preventDefault();

  useEffect(() => {
    return () => draggedFiles.forEach((f) => URL.revokeObjectURL(f.data));
  }, [draggedFiles]);

  const filteredResults = useMemo(() => {
    return [...results, ...draggedFiles]
      .filter((r) => (activeTab === 0 ? true : r.type.toLowerCase() === tabs[activeTab].toLowerCase()))
      .filter(
        (r) =>
          r.input?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (typeof r.data === "string" && r.data.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [results, draggedFiles, activeTab, searchTerm]);

  const rows = filteredResults.map((r, i) => ({
    id: r.id || i + 1,
    type: r.type,
    input: r.input || r.file?.name || "",
    data: r.data,
  }));

  const renderMarkdown = (content) => (
    <ReactMarkdown
      children={content}
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        img({ node, ...props }) {
          return <img style={{ maxWidth: "100%", borderRadius: 4, marginTop: 4 }} {...props} alt={props.alt || ""} />;
        },
      }}
    />
  );

  const renderCell = (params) => {
    const { type, data } = params.row;
    if (!data) return null;
    const lowerType = type.toLowerCase();
    switch (lowerType) {
      case "audio":
        return <audio controls src={data} style={{ width: "100%" }} />;
      case "video":
        return <video controls src={data} style={{ maxWidth: 180 }} />;
      case "markdown":
        return renderMarkdown(data);
      case "pdf":
        return <PDFViewer file={data} />;
      case "csv":
      case "txt":
        return <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{data}</Typography>;
      case "image":
        return <img src={data} alt="" style={{ maxWidth: "100%", borderRadius: 4 }} />;
      default:
        if (typeof data === "object") {
          return <ReactJson src={data} name={false} collapsed={true} displayDataTypes={false} />;
        } else {
          return <Typography variant="body2">{data}</Typography>;
        }
    }
  };

  const columns = [
    { field: "type", headerName: "Type", width: 100 },
    { field: "input", headerName: "Input/File", width: 180 },
    { field: "data", headerName: "Result", width: 440, renderCell },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      renderCell: (params) => (
        <Tooltip title="نسخ النتيجة">
          <IconButton size="small" onClick={() => handleCopy(params.row.data)}>
            <FileCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  useEffect(() => {
    if (!overlayRef.current || !liveActivity) return;
    const interval = setInterval(() => {
      overlayRef.current.style.boxShadow = `0 0 ${10 + Math.random() * 20}px #38c0fc`;
    }, 300);
    return () => clearInterval(interval);
  }, [liveActivity]);

  return (
    <Paper
      ref={overlayRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      sx={{ p: 2, bgcolor: "#13223b", mt: 2, position: "relative" }}
    >
      <Typography variant="h6" sx={{ color: "#38c0fc", mb: 1 }}>
        النتائج الأخيرة (Last Results)
      </Typography>

      <Box sx={{ mb: 1, display: "flex", gap: 1, alignItems: "center" }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          {tabs.map((tab, i) => (
            <Tab key={i} label={tab} />
          ))}
        </Tabs>
        <TextField
          placeholder="بحث..."
          size="small"
          sx={{ ml: 2 }}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          startIcon={<DownloadIcon />}
          variant="contained"
          color="success"
          sx={{ ml: "auto" }}
          onClick={handleExport}
        >
          تصدير النتائج
        </Button>
      </Box>

      <Box
        sx={{
          height: 600,
          width: "100%",
          border: "2px dashed #38c0fc44",
          p: 1,
          borderRadius: 2,
          overflow: "auto",
        }}
      >
        <Typography variant="caption" sx={{ color: "#38c0fc", mb: 1 }}>
          يمكنك سحب الملفات هنا لعرض preview
        </Typography>
        <DataGrid
          rows={rows}
          columns={columns}
          pageSize={5}
          rowsPerPageOptions={[5]}
          sx={{
            color: "#fff",
            "& .MuiDataGrid-cell": { whiteSpace: "break-word" },
            "& .MuiDataGrid-columnHeaders": { backgroundColor: "#0b1827" },
          }}
        />
      </Box>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMsg}
      />
    </Paper>
  );
}

export default ResultsPanel;