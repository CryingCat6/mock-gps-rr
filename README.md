# 📍 Advanced Mock GPS & Route Simulator

A powerful development tool designed to mock device locations and simulate complex, real-time navigation routes. This project allows developers to test location-based applications (such as maps, delivery tracking, and fitness apps) without physically moving.

---

## ✨ Features

- **🎯 Precise GPS Mocking:** Instantly teleport the device to any coordinate worldwide.
- **🛣️ Dynamic Route Simulation:** Generate and mock continuous movement along realistic paths and roads.
- **⚡ Custom Speed Controls:** Adjust mock traveling speed (walking, cycling, or driving) on the fly.
- **🔄 Loop & Playback:** Seamlessly loop simulated routes for continuous automated testing.

---

## 🚀 How It Works

This project leverages specific development framework configurations to safely inject mock data into the device's location services:

1. **Mock Provider Registration:** Registers a custom mock location provider within the system backend.
2. **Waypoints Parsing:** Decodes coordinate arrays into sequential path segments.
3. **Thread-Based Updates:** Periodically updates the device's location to simulate a smooth, moving user interface.

---

## 🛠️ Setup & Installation

### Prerequisites
Before using this tool, make sure you enable mock locations on your testing device:
1. Go to **Settings > About Phone** and tap **Build Number** 7 times to unlock Developer Options.
2. Open **Developer Options**.
3. Scroll down to **Select mock location app** and select this application.

### Local Environment Setup
```bash
# Clone the repository
git clone https://github.com

# Navigate into the project directory
cd YOUR_REPO_NAME

# Install dependencies (Change based on your tech stack, e.g., npm install / flutter pub get)
npm install
```

---

## 📱 Usage Example

Here is a quick look at how the Mock Route logic handles the location injection lifecycle:

```json
// Example of a structured mock route payload
{
  "routeName": "Test Drive Kuala Lumpur",
  "speedKmh": 60,
  "waypoints": [
    {"lat": 3.1390, "lng": 101.6869},
    {"lat": 3.1405, "lng": 101.6885},
    {"lat": 3.1420, "lng": 101.6901}
  ]
}
```

---

## 🔒 Disclaimer & Security Note

This repository is strictly for **educational and software testing purposes**. It is built to help developers debug location-aware software efficiently. The authors are not responsible for any misuse of this tool in violation of third-party terms of service.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
