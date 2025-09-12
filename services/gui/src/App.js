import React from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Box, CssBaseline, Typography } from "@mui/material";
import HeaderBar from "./components/HeaderBar";
import LeftSidebar from "./components/LeftSidebar";
import CenterPanel from "./components/CenterPanel";
import RightSidebar from "./components/RightSidebar";
import FooterBar from "./components/FooterBar";
import styled from "styled-components";

const darkKubraTheme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0c1825", paper: "#101c33" },
    primary: { main: "#38c0fc" },
    secondary: { main: "#72e6d2" },
    text: { primary: "#e0eefa", secondary: "#72e6d2" }
  },
  typography: {
    fontFamily: "Orbitron, Roboto, Arial",
    h5: { fontWeight: 700, letterSpacing: 2 }
  }
});

const LayoutRoot = styled(Box)`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: linear-gradient(120deg, #0d1a2f 60%, #182844 100%);
  font-family: Orbitron, Roboto, Arial;
`;

const MainBody = styled(Box)`
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  gap: 12px;
  margin: 0 12px;
`;

function App() {
  return (
    <ThemeProvider theme={darkKubraTheme}>
      <CssBaseline />
      <LayoutRoot>
        <HeaderBar />
        <MainBody>
          <LeftSidebar />
          <CenterPanel />
          <RightSidebar />
        </MainBody>
        <FooterBar />
      </LayoutRoot>
    </ThemeProvider>
  );
}

export default App;