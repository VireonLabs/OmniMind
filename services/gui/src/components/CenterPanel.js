import React, { useState, lazy, Suspense, memo, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  useTheme,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Fade,
} from "@mui/material";
import TerminalIcon from "@mui/icons-material/Terminal";
import MicIcon from "@mui/icons-material/Mic";
import FolderIcon from "@mui/icons-material/Folder";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import CloseIcon from "@mui/icons-material/Close";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

import ConsolePanel from "./ConsolePanel";
import AudioConsole from "./AudioConsole";
import FileUploadConsole from "./FileUploadConsole";
import ResultsPanel from "./ResultsPanel";

import { useTranslation } from "react-i18next";

// Lazy load للتبويبات الثقيلة
const VisualizationPanel = lazy(() => import("./VisualizationPanel"));

// Memoize المكونات الثقيلة لتحسين الأداء
const MemoizedResultsPanel = memo(ResultsPanel);

const DEFAULT_TABS = [
  { key: "console", labelKey: "console", icon: <TerminalIcon /> },
  { key: "audio", labelKey: "audio", icon: <MicIcon /> },
  { key: "files", labelKey: "files", icon: <FolderIcon /> },
  { key: "visualization", labelKey: "visualization", icon: <ShowChartIcon /> },
];

const MAX_SNAPSHOTS = 20; // الحد الأقصى لعدد النسخ لكل تبويب

// دالة مساعدة لتجميع النتائج حسب الفئة (يمكن التعديل حسب الهيكل)
const groupByCategory = (results) => {
  const grouped = {};
  results.forEach((res) => {
    const category = res.category || "Other";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(res);
  });
  return grouped;
};

function CenterPanel() {
  const theme = useTheme();
  const { t } = useTranslation();

  const [tab, setTab] = useState(Number(localStorage.getItem("centerTab") || 0));

  const [tabsOrder, setTabsOrder] = useState(() => {
    const savedOrder = localStorage.getItem("centerTabsOrder");
    return savedOrder ? JSON.parse(savedOrder) : DEFAULT_TABS;
  });

  // Snapshot & Time Travel state لكل تبويب
  const [snapshots, setSnapshots] = useState(() => {
    const saved = localStorage.getItem("centerSnapshots");
    return saved ? JSON.parse(saved) : DEFAULT_TABS.reduce((acc, t) => ({ ...acc, [t.key]: [] }), {});
  });

  // مؤشر الحالة الحالية لكل تبويب
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(() => {
    const saved = localStorage.getItem("centerSnapshotIndex");
    return saved ? JSON.parse(saved) : DEFAULT_TABS.reduce((acc, t) => ({ ...acc, [t.key]: 0 }), {});
  });

  // حالة Filters لكل تبويب
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem("centerFilters");
    return saved ? JSON.parse(saved) : DEFAULT_TABS.reduce((acc, t) => ({ ...acc, [t.key]: {} }), {});
  });

  // حفظ snapshots و currentSnapshotIndex و filters
  useEffect(() => {
    localStorage.setItem("centerSnapshots", JSON.stringify(snapshots));
    localStorage.setItem("centerSnapshotIndex", JSON.stringify(currentSnapshotIndex));
    localStorage.setItem("centerFilters", JSON.stringify(filters));
  }, [snapshots, currentSnapshotIndex, filters]);

  // إضافة نتيجة جديدة مع حفظ Snapshot
  const handleResult = useCallback((res, tabKey = tabsOrder[tab].key) => {
    setSnapshots((prev) => {
      const tabSnapshots = prev[tabKey] || [];
      const newSnapshot = [res, ...(tabSnapshots[currentSnapshotIndex[tabKey]] || [])].slice(0, 10);

      const updatedSnapshots = [
        ...tabSnapshots.slice(0, currentSnapshotIndex[tabKey] + 1),
        newSnapshot,
        ...tabSnapshots.slice(currentSnapshotIndex[tabKey] + 1),
      ].slice(-MAX_SNAPSHOTS); // الحفاظ على الحد الأقصى للنسخ

      setCurrentSnapshotIndex((prevIndex) => ({ ...prevIndex, [tabKey]: updatedSnapshots.length - 1 }));

      return { ...prev, [tabKey]: updatedSnapshots };
    });
  }, [tab, tabsOrder, currentSnapshotIndex]);

  const handleTabChange = (_, newValue) => {
    setTab(newValue);
    localStorage.setItem("centerTab", newValue);
  };

  // التنقل بين Snapshots
  const goToSnapshot = (direction) => {
    const tabKey = tabsOrder[tab].key;
    const maxIndex = snapshots[tabKey]?.length - 1 || 0;
    setCurrentSnapshotIndex((prev) => {
      const newIndex = Math.min(Math.max(prev[tabKey] + direction, 0), maxIndex);
      return { ...prev, [tabKey]: newIndex };
    });
  };

  // Quick Action Hotbar مع Time Travel buttons
  const QuickActions = () => (
    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
      <Tooltip title={t("clearResults")}>
        <IconButton
          size="small"
          onClick={() => {
            const tabKey = tabsOrder[tab].key;
            handleResult([], tabKey); // إضافة snapshot فارغ
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* أزرار Time Travel */}
      <Tooltip title={t("previousSnapshot")}>
        <IconButton
          size="small"
          onClick={() => goToSnapshot(-1)}
          disabled={currentSnapshotIndex[tabsOrder[tab].key] <= 0}
        >
          ←
        </IconButton>
      </Tooltip>
      <Tooltip title={t("nextSnapshot")}>
        <IconButton
          size="small"
          onClick={() => goToSnapshot(1)}
          disabled={currentSnapshotIndex[tabsOrder[tab].key] >= (snapshots[tabsOrder[tab].key]?.length - 1 || 0)}
        >
          →
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(tabsOrder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setTabsOrder(reordered);
  };

  const renderTabComponent = (tabKey) => {
    switch (tabKey) {
      case "console":
        return <ConsolePanel onResult={handleResult} />;
      case "audio":
        return <AudioConsole onResult={handleResult} />;
      case "files":
        return <FileUploadConsole onResult={handleResult} />;
      case "visualization":
        return (
          <Suspense fallback={
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <CircularProgress size={24} />
              <Box sx={{ ml: 1 }}>{t("loading")}...</Box>
            </Box>
          }>
            <VisualizationPanel onResult={(res) => handleResult(res, "visualization")} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // تطبيق Filters & Grouping على النتائج
  const currentResults = snapshots[tabsOrder[tab].key]?.[currentSnapshotIndex[tabsOrder[tab].key]] || [];
  const tabFilters = filters[tabsOrder[tab].key] || {};

  const filteredResults = currentResults.filter(result => {
    if (tabFilters.type && result.type !== tabFilters.type) return false;
    if (tabFilters.category && result.category !== tabFilters.category) return false;
    return true;
  });

  const groupedResults = groupByCategory(filteredResults);

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 1, bgcolor: theme.palette.background.paper }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="tabs-droppable" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{ display: "flex" }}
              >
                <Tabs
                  value={tab}
                  onChange={handleTabChange}
                  textColor="primary"
                  indicatorColor="primary"
                  aria-label="Center Panel Tabs"
                >
                  {tabsOrder.map((tObj, idx) => (
                    <Draggable key={tObj.key} draggableId={tObj.key} index={idx}>
                      {(draggableProvided) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          {...draggableProvided.dragHandleProps}
                        >
                          <Tab
                            icon={tObj.icon}
                            iconPosition="start"
                            label={t(tObj.labelKey)}
                            aria-label={t(tObj.labelKey)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                </Tabs>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Quick Actions لكل تبويب */}
        <QuickActions />

        {/* Animations سلسة عند تبديل التبويبات */}
        <Fade in key={tabsOrder[tab].key}>
          <Box sx={{ mt: 1 }}>
            {renderTabComponent(tabsOrder[tab].key)}
          </Box>
        </Fade>
      </Paper>

      {/* نتائج العمليات لكل تبويب مع Mini AI Suggestions و Filters & Grouping */}
      <MemoizedResultsPanel
        results={groupedResults}
        tabKey={tabsOrder[tab].key}
        enableAISuggestions
        filters={tabFilters}
        onFilterChange={(newFilters) => setFilters(prev => ({ ...prev, [tabsOrder[tab].key]: newFilters }))}
      />
    </Box>
  );
}

export default CenterPanel;