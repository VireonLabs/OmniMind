import React, { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

function VisualizationPanel({ activityLevel = 0.5, size = 200, color = "#38c0fc" }) {
  const [time, setTime] = useState(Date.now());
  const requestRef = useRef();

  // Animation loop
  const animate = () => {
    setTime(Date.now());
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  const center = size / 2;
  const mainRadius = 70 + Math.abs(Math.sin(time / 300)) * 16 * activityLevel;
  const orbitX = center + Math.sin(time / 200) * 30 * activityLevel;
  const orbitY = center + Math.cos(time / 200) * 28 * activityLevel;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pt: 2,
        minHeight: size,
      }}
    >
      <Typography variant="h6" sx={{ color, mb: 2 }}>
        Audio / Brain Visualization
      </Typography>
      <svg width={size} height={size}>
        <circle
          cx={center}
          cy={center}
          r={mainRadius}
          fill={`${color}22`}
          stroke={color}
          strokeWidth={5}
          style={{ filter: `drop-shadow(0 0 28px ${color})` }}
        />
        <circle cx={orbitX} cy={orbitY} r={22} fill={`${color}88`} />
      </svg>
    </Box>
  );
}

export default VisualizationPanel;