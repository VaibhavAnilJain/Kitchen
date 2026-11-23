# Kitchen Management System (KMS)

A Node.js and Express.js backend solution designed to optimize inventory management, meal planning, and kitchen operations. KMS provides a RESTful API and real-time event layer for managing meals, ingredients, staff, orders, and kitchen rules within a centralized digital ecosystem.

## Key Features

* **Inventory & Meal Management:** Track ingredients, plan meals, and enforce kitchen rules.
* **Order & Staff Workflows:** Manage orders and coordinate staff operations through a structured API.
* **Authentication & Security:** JWT-based authentication (`jsonwebtoken`), password hashing (`bcryptjs`), input validation (`validator`), and CORS support.
* **Real-Time Notifications:** Live updates for kitchen events and order statuses powered by `socket.io`.
* **Email Notifications:** Transactional emails and account verification via `nodemailer` and SendGrid (`nodemailer-sendgrid-transport`).
* **Payment Processing:** Integrated payment workflows using `stripe`.
* **Media & File Uploads:** File upload handling via `express-fileupload` with cloud-based image storage.
* **API Documentation & Logging:** Auto-generated interactive API docs (`swagger-autogen`, `swagger-ui-express`) and structured application logging (`winston`).

## Tech Stack

* **Runtime & Framework:** Node.js, Express.js
* **Database:** MongoDB (Mongoose ODM)
* **Real-Time Communication:** Socket.IO
* **Payments:** Stripe
* **Email Service:** Nodemailer + SendGrid
* **API Documentation:** Swagger UI & Swagger Autogen
* **Logging:** Winston

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/)
* npm
* MongoDB instance (local or MongoDB Atlas)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VaibhavAnilJain/Kitchen.git
   cd Kitchen
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory and add your configuration values:
   ```env
   PORT=3000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   STRIPE_SECRET_KEY=your_stripe_secret_key
   SENDGRID_API_KEY=your_sendgrid_api_key
   ```
  

### Running the Application

* **Development mode** (with hot-reload via Nodemon):
  ```bash
  npm run dev
  ```

* **Production mode:**
  ```bash
  npm start
  ```

* **Generate Swagger API documentation:**
  ```bash
  npm run swagger
  ```
