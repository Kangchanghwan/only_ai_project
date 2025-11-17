# GEMINI.md

## Project Overview

This is a real-time image sharing application. It allows users to create or join rooms and share images from their clipboard with other users in the same room. The application uses a client-server architecture with a Vue.js frontend and a Node.js backend. Real-time communication is handled using Socket.IO.

The backend is written in TypeScript and uses Express for the web server. It manages rooms and users, and it's responsible for broadcasting messages to clients in the same room.

The frontend is built with Vue 3 and Vite. It uses composable functions to manage different aspects of the application, such as room management, file management, clipboard interaction, and WebSocket communication.

## Building and Running

### Backend

To run the backend server, follow these steps:

1.  Navigate to the `backend` directory.
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

The backend server will be running on `http://localhost:3001`.

### Frontend

To run the frontend application, follow these steps:

1.  Navigate to the `frontend` directory.
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

The frontend application will be accessible at `http://localhost:5174`.

## Development Conventions

### Backend

*   **TDD (Test-Driven Development):** Tests are written before the implementation. The project uses Jest for testing.
*   **TypeScript:** The backend is written in TypeScript with strict mode enabled to ensure type safety.
*   **Modularity:** The room management logic is encapsulated in a `RoomManager` class.

### Frontend

*   **Vue 3 Composables:** The frontend uses Vue 3's Composition API with composable functions to organize and reuse logic.
*   **Component-Based Architecture:** The UI is built with reusable Vue components.
*   **Vite:** The project uses Vite for fast development and builds.
