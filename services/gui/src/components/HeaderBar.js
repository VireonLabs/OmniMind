import React from "react";
import { Box, Typography, Chip } from "@mui/material";
import styled from "styled-components";

const Glow = styled.span`
  color: #38c0fc;
  text-shadow: 0 0 8px #38c0fc, 0 0 18px #38c0fc44;
  font-weight: bold;
  font-size: 1.4em;
`;

function HeaderBar() {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      p: "12px", borderBottom: "2px solid #253f5e", background: "#101c33"
    }}>
      <Typography variant="h5" sx={{ letterSpacing: "2px" }}>
        <Glow>KUBRA</Glow> / <span style={{ color: "#72e6d2" }}>AURA</span> — System Dashboard
      </Typography>
      <Chip label="Status: RUNNING / Secure JWT" color="success" sx={{
        fontWeight: 700, boxShadow: "0 0 6px #38c0fc88", letterSpacing: "1px"
      }} />
    </Box>
  );
}

export default HeaderBar;