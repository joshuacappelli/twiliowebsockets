import fastify, { FastifyReply } from 'fastify';
import Websocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import twilio from 'twilio';

dotenv.config();

const {
    TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PHONE_NUMBER_FROM,
  DOMAIN : rawDomain,
  OPENAI_API_KEY,

} = process.env;


if (typeof rawDomain === 'undefined') {
    console.error("undefined domain");
    process.exit(1);
  } else {
    console.log(rawDomain);
  }

if( typeof PHONE_NUMBER_FROM === 'undefined') {
    process.exit(1);
}

const DOMAIN = rawDomain.replace(/(^\w+:|^)\/\//, '').replace(/\/+$/, ''); // Clean protocols and slashes
const SYSTEM_MESSAGE = 'You are a helpful AI assistant that makes phone calls to restaurants to book reservations. You currently are calling a steakhouse and you are hoping to book a reservation tonight for 8pm give or take 1 hour';
const VOICE = 'alloy';
const PORT = process.env.PORT || 6060;
const outboundTwiML = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://${DOMAIN}/media-stream" /></Connect></Response>`;

const LOG_EVENT_TYPES = [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created'
];

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !PHONE_NUMBER_FROM || !rawDomain || !OPENAI_API_KEY) {
    console.error('One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, and OPENAI_API_KEY are set.');
    process.exit(1);
}

const  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function isNumberAllowed(to : string) {
    try {
  
      // Uncomment these lines to test numbers. Only add numbers you have permission to call
      // const consentMap = {"+18005551212": true}
      // if (consentMap[to]) return true;
  
      // Check if the number is a Twilio phone number in the account, for example, when making a call to the Twilio Dev Phone
      const incomingNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: to });
      if (incomingNumbers.length > 0) {
        return true;
      }
  
      // Check if the number is a verified outgoing caller ID. https://www.twilio.com/docs/voice/api/outgoing-caller-ids
      const outgoingCallerIds = await client.outgoingCallerIds.list({ phoneNumber: to });
      if (outgoingCallerIds.length > 0) {
        return true;
      }
  
      return false;
    } catch (error) {
      console.error('Error checking phone number:', error);
      return false;
    }
  }

  async function makeCall(to : string) {
    try {
      const isAllowed = await isNumberAllowed(to);
      if (!isAllowed) {
        console.warn(`The number ${to} is not recognized as a valid outgoing number or caller ID.`);
        process.exit(1);
      }

      if(typeof PHONE_NUMBER_FROM === 'undefined') {
        return;
      }
  
      const call = await client.calls.create({
        from: PHONE_NUMBER_FROM,
        to,
        twiml: outboundTwiML,
      });
      console.log(`Call started with SID: ${call.sid}`);
    } catch (error) {
      console.error('Error making call:', error);
    }
}

const server = fastify();
server.register(fastifyFormBody);
server.register(fastifyWs);

server.get('/', async (request, reply) => {
    reply.send({ message: 'Twilio Media stream server is running'});
});


