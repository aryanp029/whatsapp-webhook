// Import required modules
const express = require('express');
const axios = require('axios');
require('dotenv').config();

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and configuration
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const accessToken = process.env.ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const backendApiUrl = process.env.BACKEND_API_URL || 'https://daoos-api-sever.onrender.com/query';

// WhatsApp Cloud API base URL
const WHATSAPP_API_URL = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`;

// Function to send typing indicator
async function sendTypingIndicator(to, messageId) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Typing indicator sent:', response.data);
  } catch (error) {
    console.error('Error sending typing indicator:', error.response?.data || error.message);
  }
}

// Function to send message
async function sendMessage(to, message) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: {
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Function to get response from backend API
async function getBackendResponse(messageText) {
  try {
    const response = await axios.post(
      backendApiUrl,
      {
        query: messageText,
        reset_conversation: false
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Backend API response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error calling backend API:', error.response?.data || error.message);
    return { error: 'Failed to get response from backend' };
  }
}

// Function to process incoming messages
async function processMessage(message) {
  const from = message.from;
  const messageId = message.id;
  const messageText = message.text?.body || '';
  
  console.log(`Received message from ${from}: ${messageText}`);
  console.log(`Message ID: ${messageId}`);
  
  // Send typing indicator with message ID
  await sendTypingIndicator(from, messageId);
  
  // Get response from backend API (typing indicator will show during this time)
  const backendResponse = await getBackendResponse(messageText);
  
  // Extract response text from backend
  let responseText = 'test1'; // fallback
  if (backendResponse && !backendResponse.error) {
    // Adjust this based on your backend response structure
    responseText = backendResponse.response || backendResponse.message || backendResponse.text || JSON.stringify(backendResponse);
  } else if (backendResponse.error) {
    responseText = 'Sorry, I encountered an error processing your message.';
  }
  
  // Send response message
  await sendMessage(from, responseText);
}

// Route for GET requests (webhook verification)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.status(403).end();
  }
});

// Route for POST requests (webhook events)
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  
  try {
    const body = req.body;
    
    // Check if this is a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach(entry => {
        entry.changes?.forEach(change => {
          if (change.field === 'messages') {
            change.value.messages?.forEach(message => {
              processMessage(message);
            });
          }
        });
      });
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(port, () => {
  console.log(`\nWhatsApp Cloud API Server listening on port ${port}`);
  console.log(`Webhook URL: http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health\n`);
});
