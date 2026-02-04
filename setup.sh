#!/bin/bash
set -e

echo "🚀 Open Sesh - Development Environment Setup"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo -e "${GREEN}✓ Homebrew already installed${NC}"
fi

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${YELLOW}Installing Rust...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo -e "${GREEN}✓ Rust already installed ($(rustc --version))${NC}"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js via Homebrew...${NC}"
    brew install node
else
    echo -e "${GREEN}✓ Node.js already installed ($(node --version))${NC}"
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
else
    echo -e "${GREEN}✓ pnpm already installed ($(pnpm --version))${NC}"
fi

# Install Tauri CLI
if ! command -v cargo-tauri &> /dev/null; then
    echo -e "${YELLOW}Installing Tauri CLI...${NC}"
    cargo install tauri-cli --version "^2.0.0"
else
    echo -e "${GREEN}✓ Tauri CLI already installed${NC}"
fi

# macOS specific: Check for Xcode Command Line Tools
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! xcode-select -p &> /dev/null; then
        echo -e "${YELLOW}Installing Xcode Command Line Tools...${NC}"
        xcode-select --install
        echo -e "${YELLOW}Please complete the Xcode installation and re-run this script.${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ Xcode Command Line Tools installed${NC}"
    fi
fi

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✓ All dependencies installed!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Make sure you have a .env file with your API keys:"
echo "     ANTHROPIC_API_KEY=sk-ant-..."
echo "     OPENAI_API_KEY=sk-..."
echo ""
echo "  2. Install project dependencies:"
echo "     pnpm install"
echo ""
echo "  3. Run the development server:"
echo "     pnpm tauri dev"
echo ""
