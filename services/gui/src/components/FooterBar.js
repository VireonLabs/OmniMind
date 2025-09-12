// services/gui/src/components/FooterBar.js
import React, { useCallback, useMemo, useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Box,
  Typography,
  Link,
  Stack,
  IconButton,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Tooltip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

/**
 * Final FooterBar with Auto Dark/Light Mode + Toggle
 *
 * ✅ Responsive + Compact
 * ✅ Overflow handling ("More" menu)
 * ✅ Theme-aware (auto dark/light)
 * ✅ Optional manual toggle with persistence (localStorage)
 * ✅ Accessibility + Keyboard support
 * ✅ Customizable props
 */

function FooterBar({
  version = "v2.0",
  product = "KUBRA / AURA AI",
  links = [
    { label: "Docs", href: "#" },
    { label: "Feedback", href: "#" },
    { label: "Tutorials", href: "#" },
  ],
  compact = false,
  labels = null,
  sx = {},
  onLinkClick = null,
  maxLinks = 3,
  showBackToTop = true,
  backToTopLabel = "Back to top",
  locale = undefined,
  showYear = true,
}) {
  const theme = useTheme();
  const preferCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const isCompact = compact || preferCompact;

  // menu state
  const [anchorEl, setAnchorEl] = useState(null);
  const openMore = Boolean(anchorEl);
  const handleOpenMore = useCallback((e) => setAnchorEl(e.currentTarget), []);
  const handleCloseMore = useCallback(() => setAnchorEl(null), []);

  // theme mode toggle state
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("themeMode") || theme.palette.mode;
    }
    return theme.palette.mode;
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", mode);
      localStorage.setItem("themeMode", mode);
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // labels with i18n / overrides
  const poweredByText = labels?.poweredBy ?? `Powered by ${product}`;
  const versionText = labels?.version ?? version;

  const year = useMemo(() => {
    if (!showYear) return null;
    try {
      return new Intl.DateTimeFormat(locale || undefined, { year: "numeric" }).format(new Date());
    } catch {
      return new Date().getFullYear();
    }
  }, [showYear, locale]);

  // split links
  const { visibleLinks, overflowLinks } = useMemo(() => {
    if (!Array.isArray(links)) return { visibleLinks: [], overflowLinks: [] };
    if (links.length <= maxLinks) return { visibleLinks: links, overflowLinks: [] };
    return { visibleLinks: links.slice(0, maxLinks), overflowLinks: links.slice(maxLinks) };
  }, [links, maxLinks]);

  // click handler
  const handleLinkClick = useCallback(
    (link, event) => {
      let prevented = false;
      if (onLinkClick) {
        try {
          const maybe = onLinkClick(link, event);
          if (maybe === false) prevented = true;
        } catch (err) {
          console.error("FooterBar onLinkClick handler error:", err);
        }
      }
      if (!prevented && link.href && link.href !== "#") {
        // allow navigation
      } else if (!prevented) {
        if (event && event.preventDefault) event.preventDefault();
      }
    },
    [onLinkClick]
  );

  // back to top
  const handleBackToTop = useCallback(() => {
    try {
      if (typeof window !== "undefined" && window.scrollTo) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      // ignore
    }
  }, []);

  const handleKeyMenuActivate = useCallback(
    (e, link) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleLinkClick(link, e);
        handleCloseMore();
      }
    },
    [handleLinkClick, handleCloseMore]
  );

  // Auto dark/light styling
  const isDark = mode === "dark";
  const bgColor = isDark ? theme.palette.background.paper : theme.palette.background.default;
  const borderColor = theme.palette.divider;
  const textColor = isDark ? theme.palette.grey[300] : theme.palette.text.primary;
  const linkColor = isDark ? theme.palette.info.light : theme.palette.primary.main;

  return (
    <Box
      component="footer"
      role="contentinfo"
      sx={{
        p: isCompact ? "6px 12px" : "10px 24px",
        bgcolor: bgColor,
        borderTop: `2px solid ${borderColor}`,
        color: textColor,
        fontSize: isCompact ? "0.9rem" : "1.05rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: 2,
        flexWrap: "wrap",
        transition: "background-color 0.3s ease, color 0.3s ease",
        ...sx,
      }}
    >
      <StackLeft poweredByText={poweredByText} versionText={versionText} year={year} isCompact={isCompact} />

      <Stack direction="row" spacing={1} alignItems="center" component="nav" aria-label="Footer links">
        {/* visible links */}
        {visibleLinks.map((l) => (
          <Link
            key={l.label}
            href={l.href || "#"}
            target={l.href && l.href !== "#" ? "_blank" : undefined}
            rel={l.href && l.href !== "#" ? "noopener noreferrer" : undefined}
            underline="hover"
            sx={{
              color: linkColor,
              fontSize: isCompact ? 12 : 14,
              cursor: "pointer",
              transition: "color 0.3s ease",
              "&:hover": { color: theme.palette.secondary.main },
              "&:focus": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
            onClick={(e) => handleLinkClick(l, e)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLinkClick(l, e);
            }}
            aria-label={l.label}
          >
            {l.label}
          </Link>
        ))}

        {/* overflow */}
        {overflowLinks.length > 0 && (
          <>
            <Tooltip title={`More (${overflowLinks.length})`} arrow>
              <IconButton
                aria-label="More links"
                aria-haspopup="true"
                onClick={handleOpenMore}
                size="small"
                sx={{ color: linkColor }}
              >
                <MoreVertIcon />
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              open={openMore}
              onClose={handleCloseMore}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
              {overflowLinks.map((l) => (
                <MenuItem
                  key={l.label}
                  onClick={(e) => {
                    handleLinkClick(l, e);
                    handleCloseMore();
                  }}
                  onKeyDown={(e) => handleKeyMenuActivate(e, l)}
                >
                  <Typography variant="body2" sx={{ color: textColor }}>
                    {l.label}
                  </Typography>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        {/* theme toggle */}
        <Tooltip title={`Switch to ${isDark ? "Light" : "Dark"} mode`} arrow>
          <IconButton
            aria-label="Toggle theme mode"
            onClick={toggleMode}
            size="small"
            sx={{ color: linkColor }}
          >
            {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* back to top */}
        {showBackToTop && (
          <IconButton
            aria-label={backToTopLabel}
            onClick={handleBackToTop}
            size="small"
            sx={{ color: linkColor, ml: 1 }}
            title={backToTopLabel}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

function StackLeft({ poweredByText, versionText, year, isCompact }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ gap: isCompact ? 1 : 2 }}>
      <Typography variant="body2" sx={{ color: "inherit" }}>
        {poweredByText} • {versionText}
      </Typography>
      {year && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          © {year}
        </Typography>
      )}
    </Stack>
  );
}

FooterBar.propTypes = {
  version: PropTypes.string,
  product: PropTypes.string,
  links: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      href: PropTypes.string,
    })
  ),
  compact: PropTypes.bool,
  labels: PropTypes.shape({
    poweredBy: PropTypes.string,
    version: PropTypes.string,
  }),
  sx: PropTypes.object,
  onLinkClick: PropTypes.func,
  maxLinks: PropTypes.number,
  showBackToTop: PropTypes.bool,
  backToTopLabel: PropTypes.string,
  locale: PropTypes.string,
  showYear: PropTypes.bool,
};

export default React.memo(FooterBar);