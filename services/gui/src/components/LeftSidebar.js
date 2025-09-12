import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Button,
  Stack,
  useTheme,
  Slider,
  Tooltip,
  Snackbar,
  IconButton,
  Alert,
  FormControlLabel,
  Switch,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DownloadIcon from "@mui/icons-material/Download";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import axios from "axios";

// 🌐 i18n
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

/**
 * LeftSidebar — لوحة جانبية تعرض Metrics, CPU chart, Quick Actions.
 *
 * GET  /metrics         -> { cpu_percent, memory_percent, queue_len }
 * POST /restart         -> (200) إعادة تشغيل العامل
 * POST /export-logs     -> (200) بدء عملية تصدير السجلات
 *
 * ENV:
 * REACT_APP_API_URL
 * REACT_APP_METRICS_INTERVAL_SEC
 * REACT_APP_API_KEY
 */

/**
 * i18n initialization (kept inside the file for minimal setup).
 * Language preference is read from localStorage ('lng') if present.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        systemMetrics: "System Metrics",
        cpu: "CPU",
        memory: "Memory",
        queue: "Queue",
        cpuMiniChart: "CPU Mini-Chart",
        refreshInterval: "Refresh interval",
        quickActions: "Quick Actions",
        restart: "Restart Worker",
        export: "Export Logs",
        sparklines: "Sparklines",
        apiLost: "⚠️ API connection lost",
        restartTip: "Restart background worker process",
        exportTip: "Export logs (zip) from the server",
        unauthorized: "Unauthorized: Invalid API key",
        fetchFail: "Failed to fetch metrics",
        restartSuccess: "Restart command sent",
        restartFail: "Restart failed",
        exportSuccess: "Export started",
        exportFail: "Export failed",
        languageEnglish: "English",
        languageArabic: "العربية",
      },
    },
    ar: {
      translation: {
        systemMetrics: "مؤشرات النظام",
        cpu: "المعالج",
        memory: "الذاكرة",
        queue: "قائمة الانتظار",
        cpuMiniChart: "مخطط المعالج المصغر",
        refreshInterval: "فترة التحديث",
        quickActions: "إجراءات سريعة",
        restart: "إعادة تشغيل العامل",
        export: "تصدير السجلات",
        sparklines: "الرسوم الصغيرة",
        apiLost: "⚠️ الاتصال بالـ API مفقود",
        restartTip: "إعادة تشغيل عملية العامل",
        exportTip: "تصدير السجلات (zip) من الخادم",
        unauthorized: "غير مصرح: مفتاح API غير صالح",
        fetchFail: "فشل في جلب المؤشرات",
        restartSuccess: "تم إرسال أمر إعادة التشغيل",
        restartFail: "فشلت إعادة التشغيل",
        exportSuccess: "بدأ التصدير",
        exportFail: "فشل التصدير",
        languageEnglish: "English",
        languageArabic: "العربية",
      },
    },
  },
  lng: localStorage.getItem("lng") || "ar",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

const BOX_WIDTH = 280;
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8500";
const DEFAULT_INTERVAL = Number(process.env.REACT_APP_METRICS_INTERVAL_SEC || 5);

function LeftSidebar() {
  const theme = useTheme();
  const { t } = useTranslation();

  const [metrics, setMetrics] = useState({
    cpu_percent: 0,
    memory_percent: 0,
    queue_len: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL);
  const [showSparklines, setShowSparklines] = useState(
    localStorage.getItem("showSparklines") !== "false"
  );

  const intervalRef = useRef(null);

  const [snack, setSnack] = useState({ open: false, message: "", severity: "info" });
  const [apiOnline, setApiOnline] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  // Axios instance (adds X-API-KEY automatically from env)
  const api = axios.create({
    baseURL: API_URL,
    timeout: 5000,
    headers: {
      "X-API-KEY": process.env.REACT_APP_API_KEY || "",
    },
  });

  // Interceptors for auth & connectivity errors
  api.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setSnack({ open: true, message: t("unauthorized"), severity: "error" });
      }
      if (!err.response) {
        setApiOnline(false);
      }
      return Promise.reject(err);
    }
  );

  const fetchMetrics = async () => {
    try {
      const res = await api.get("/metrics");
      const data = res.data || {};
      const cpu = Number(data.cpu_percent ?? metrics.cpu_percent);
      const mem = Number(data.memory_percent ?? metrics.memory_percent);
      const qlen = Number(data.queue_len ?? metrics.queue_len);

      setMetrics({ cpu_percent: cpu, memory_percent: mem, queue_len: qlen });

      setChartData((prev) => {
        const next = [...prev, { ts: Date.now(), cpu, mem, qlen: Math.min(qlen * 10, 100) }];
        return next.slice(-20);
      });
      setApiOnline(true);
    } catch (err) {
      console.error("Failed to fetch metrics", err);
      setSnack({ open: true, message: t("fetchFail"), severity: "error" });
    }
  };

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, intervalSec * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSec]);

  // persist sparklines preference
  useEffect(() => {
    try {
      localStorage.setItem("showSparklines", showSparklines);
    } catch (e) {
      // ignore (e.g., SSR or blocked storage)
    }
  }, [showSparklines]);

  const handleRestart = async () => {
    setButtonsDisabled(true);
    try {
      await api.post("/restart");
      setSnack({ open: true, message: t("restartSuccess"), severity: "success" });
    } catch (err) {
      console.error("Restart failed", err);
      setSnack({ open: true, message: t("restartFail"), severity: "error" });
    } finally {
      setTimeout(() => setButtonsDisabled(false), 3000);
    }
  };

  const handleExport = async () => {
    setButtonsDisabled(true);
    try {
      await api.post("/export-logs");
      setSnack({ open: true, message: t("exportSuccess"), severity: "success" });
    } catch (err) {
      console.error("Export failed", err);
      setSnack({ open: true, message: t("exportFail"), severity: "error" });
    } finally {
      setTimeout(() => setButtonsDisabled(false), 3000);
    }
  };

  const handleCloseSnack = () => setSnack((s) => ({ ...s, open: false }));

  // toggle language and persist
  const toggleLanguage = () => {
    const newLng = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLng);
    try {
      localStorage.setItem("lng", newLng);
    } catch (e) {
      // ignore
    }
  };

  const gradientBg = `linear-gradient(180deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`;
  const cardSx = {
    p: 2,
    background: gradientBg,
    boxShadow:
      "0 8px 22px rgba(2,6,23,0.55), inset 0 1px 0 rgba(255,255,255,0.02), 0 4px 10px rgba(0,0,0,0.16)",
    borderRadius: 12,
  };

  const Sparkline = ({ dataKey, color }) => (
    <ResponsiveContainer width={60} height={20}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
        <XAxis dataKey="ts" hide />
        <YAxis domain={[0, 100]} hide />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <Box
      sx={{
        width: BOX_WIDTH,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        mt: 1,
        px: 1,
      }}
    >
      {/* Language toggle */}
      <Button size="small" variant="outlined" onClick={toggleLanguage}>
        {i18n.language === "ar" ? t("languageEnglish") : t("languageArabic")}
      </Button>

      {/* Banner if API offline */}
      {!apiOnline && (
        <Paper sx={{ p: 1, bgcolor: theme.palette.error.main, color: "#fff" }}>
          <Typography variant="caption">{t("apiLost")}</Typography>
        </Paper>
      )}

      {/* System Metrics */}
      <motion.div
        whileHover={{ rotateX: -3, rotateY: 3, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <Paper sx={{ ...cardSx }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle1">{t("systemMetrics")}</Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showSparklines}
                  onChange={(e) => setShowSparklines(e.target.checked)}
                />
              }
              label={t("sparklines")}
              labelPlacement="start"
              sx={{ m: 0 }}
            />
          </Box>

          {/* CPU */}
          <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ mb: 0.5, fontFamily: "monospace" }}>
                {t("cpu")}: {metrics.cpu_percent.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={metrics.cpu_percent}
                sx={{ height: 8, borderRadius: 6 }}
                color="primary"
              />
            </Box>
            {showSparklines && <Sparkline dataKey="cpu" color={theme.palette.primary.main} />}
          </Box>

          {/* Memory */}
          <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ mb: 0.5, fontFamily: "monospace" }}>
                {t("memory")}: {metrics.memory_percent.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={metrics.memory_percent}
                sx={{ height: 8, borderRadius: 6 }}
                color="secondary"
              />
            </Box>
            {showSparklines && <Sparkline dataKey="mem" color={theme.palette.secondary.main} />}
          </Box>

          {/* Queue */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ mb: 0.5, fontFamily: "monospace" }}>
                {t("queue")}: {metrics.queue_len}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(metrics.queue_len * 10, 100)}
                sx={{ height: 8, borderRadius: 6 }}
                color="info"
              />
            </Box>
            {showSparklines && <Sparkline dataKey="qlen" color={theme.palette.info.main} />}
          </Box>
        </Paper>
      </motion.div>

      {/* CPU Mini Chart */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <Paper sx={{ ...cardSx, p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("cpuMiniChart")}
          </Typography>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="cpu"
                stroke={theme.palette.primary.main}
                strokeWidth={2}
                dot={false}
                isAnimationActive={true}
                animationDuration={800}
              />
              <XAxis dataKey="ts" hide />
              <YAxis domain={[0, 100]} hide />
            </LineChart>
          </ResponsiveContainer>

          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
              {t("refreshInterval")}: <strong>{intervalSec}s</strong>
            </Typography>
            <Slider
              size="small"
              min={2}
              max={30}
              value={intervalSec}
              onChange={(_, v) => setIntervalSec(Number(v))}
              valueLabelDisplay="auto"
              aria-label="Refresh interval seconds"
            />
          </Box>
        </Paper>
      </motion.div>

      {/* Quick Actions */}
      <motion.div whileHover={{ translateY: -3 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
        <Paper sx={{ ...cardSx, p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("quickActions")}
          </Typography>

          <Stack direction="column" spacing={1}>
            <Tooltip title={t("restartTip")} placement="right">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="small"
                  startIcon={<RestartAltIcon />}
                  variant="contained"
                  color="primary"
                  onClick={handleRestart}
                  disabled={buttonsDisabled}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  {t("restart")}
                </Button>
              </motion.div>
            </Tooltip>

            <Tooltip title={t("exportTip")} placement="right">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  variant="contained"
                  color="secondary"
                  onClick={handleExport}
                  disabled={buttonsDisabled}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  {t("export")}
                </Button>
              </motion.div>
            </Tooltip>
          </Stack>
        </Paper>
      </motion.div>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={handleCloseSnack}
        action={
          <IconButton size="small" aria-label="close" color="inherit" onClick={handleCloseSnack}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <Alert severity={snack.severity} onClose={handleCloseSnack} sx={{ width: "100%" }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default LeftSidebar;