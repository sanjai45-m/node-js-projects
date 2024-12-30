const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('google-auth-library');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors());

// Initialize Firebase Admin SDK
const serviceAccount = require('./keys/feeedd-752c8-firebase-adminsdk-8l2he-cdc83554eb.json');
console.log('Service Account Loaded:', serviceAccount);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://feeedd-752c8-default-rtdb.firebaseio.com/', // Replace with your database URL
});

// Function to get the access token for FCM
async function getAccessToken() {
  const client = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/firebase.messaging']
  );

  const { token } = await client.authorize(); // Make sure to destructure token from the response
  return token;
}

// Endpoint to register FCM token
app.post('/api/register-token', async (req, res) => {
  const { token } = req.body;

  // Store the token in Firebase Realtime Database
  try {
    await admin.database().ref('tokens').push({ token });
    res.status(200).send('Token registered successfully');
  } catch (error) {
    console.error('Error registering token:', error);
    res.status(500).send('Error registering token');
  }
});

// Endpoint to send messages
app.post('/api/send-message', async (req, res) => {
  const { message, storyId } = req.body;

  // Retrieve all FCM tokens from Firebase Realtime Database
  const snapshot = await admin.database().ref('tokens').once('value');
  const tokens = [];
  snapshot.forEach((childSnapshot) => {
    tokens.push(childSnapshot.val().token);
  });

  const payload = {
    notification: {
      title: 'New Message',
      body: message,
    },
    data: {
      story_id: storyId,
    },
  };

  // Send notifications to all tokens
  try {
    const accessToken = await getAccessToken();
    const promises = tokens.map(token => {
      return axios.post(
        `https://fcm.googleapis.com/v1/projects/feeedd-752c8/messages:send`,
        { message: { token, ...payload } },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    });
    await Promise.all(promises);
    res.status(200).send('Messages sent successfully');
  } catch (error) {
    console.error('Error sending messages:', error);
    res.status(500).send('Error sending messages');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
