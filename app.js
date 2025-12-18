// Configuration: Enter your API Key here to avoid typing it in the UI
const HARDCODED_API_KEY = null; // e.g., 'AIzaSy...'

// App State
const state = {
    currentLevel: 'B1',
    messages: [],
    apiKey: HARDCODED_API_KEY || localStorage.getItem('gemini_api_key') || '',
    isDemo: !HARDCODED_API_KEY && !localStorage.getItem('gemini_api_key'),
    // Voice State
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    isSpeakerOn: true // Default TTS on
};

// DOM Elements
const scenes = {
    selection: document.getElementById('level-selection'),
    chat: document.getElementById('chat-interface'),
    report: document.getElementById('analysis-report')
};
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const levelDisplay = document.getElementById('current-level-display');
const apiKeyInput = document.getElementById('api-key-input');
const settingsModal = document.getElementById('settings-modal');
const micBtn = document.getElementById('mic-btn');
const speakerBtn = document.getElementById('speaker-btn');
const sheetsUrlInput = document.getElementById('sheets-url');
const aiFeedbackDiv = document.getElementById('ai-feedback');
const fullTranscriptDiv = document.getElementById('full-transcript');

// Initialize
function init() {
    if (state.apiKey) {
        apiKeyInput.value = state.apiKey;
        state.isDemo = false;
    }
    updateSpeakerIcon();
}

// Navigation Functions
function selectLevel(level) {
    state.currentLevel = level;
    levelDisplay.textContent = level;

    // Smooth Transition
    scenes.selection.classList.add('hidden');
    scenes.selection.classList.remove('active');

    setTimeout(() => {
        scenes.chat.classList.remove('hidden');
        scenes.chat.classList.add('active');
        // Initial Greeting
        const greeting = `Welcome! I'm your Level ${level} English Tutor. Let's practice!`;
        addSystemMessage(greeting);
    }, 400);
}

function goBack() {
    scenes.chat.classList.add('hidden');
    scenes.chat.classList.remove('active');

    setTimeout(() => {
        scenes.selection.classList.remove('hidden');
        scenes.selection.classList.add('active');
        chatHistory.innerHTML = ''; // Clear chat or keep history? Let's clear for fresh start
        state.messages = [];
    }, 400);
}

function endSession() {
    // Switch to Report Scene
    scenes.chat.classList.add('hidden');
    scenes.chat.classList.remove('active');

    setTimeout(() => {
        scenes.report.classList.remove('hidden');
        scenes.report.classList.add('active');

        // Generate Content
        renderTranscript();
        generateFeedback();
    }, 400);
}

function restartSession() {
    scenes.report.classList.add('hidden');
    scenes.report.classList.remove('active');

    setTimeout(() => {
        scenes.selection.classList.remove('hidden');
        scenes.selection.classList.add('active');
        // Reset State
        chatHistory.innerHTML = '';
        state.messages = [];
        state.audioChunks = [];
        aiFeedbackDiv.textContent = "Generating feedback...";
        fullTranscriptDiv.innerHTML = "";
    }, 400);
}

// Chat Functions
function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // Add User Message
    addMessage('user', text);
    userInput.value = '';

    // Show Loading
    setTimeout(() => {
        generateResponse(text);
    }, 1000);
}

function addMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = sender === 'user' ? 'You' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    state.messages.push({ sender, text });

    // Speak if AI
    if (sender === 'ai' && state.isSpeakerOn) {
        speakText(text);
    }
}

function addSystemMessage(text) {
    addMessage('ai', text);
}

// Voice Functions
function toggleSpeaker() {
    state.isSpeakerOn = !state.isSpeakerOn;
    updateSpeakerIcon();
    if (!state.isSpeakerOn) {
        window.speechSynthesis.cancel();
    }
}

function updateSpeakerIcon() {
    // speakerBtn might be null if not loaded yet? No, it's captured in DOM elements.
    if (!speakerBtn) return;

    if (state.isSpeakerOn) {
        speakerBtn.classList.add('active-speaker');
        speakerBtn.classList.remove('muted-speaker');
    } else {
        speakerBtn.classList.remove('active-speaker');
        speakerBtn.classList.add('muted-speaker');
    }
}

function speakText(text) {
    if (!window.speechSynthesis) return;

    // Stop any current speaking
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';

    // Pick a good voice if available
    const voices = window.speechSynthesis.getVoices();
    const googleVoice = voices.find(v => v.name.includes('Google US English'));
    if (googleVoice) utterance.voice = googleVoice;

    window.speechSynthesis.speak(utterance);
}

async function toggleRecording() {
    if (!state.isRecording) {
        // Initialize stream if not already done
        if (!state.stream) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.stream = stream;
            } catch (err) {
                console.error("Error accessing microphone:", err);
                alert("Could not access microphone: " + err.message);
                return;
            }
        }
        startRecording();
    } else {
        stopRecording();
    }
}

function startRecording() {
    if (!state.stream) return;

    try {
        // Create new MediaRecorder with existing stream
        state.mediaRecorder = new MediaRecorder(state.stream);
        state.audioChunks = [];

        state.mediaRecorder.addEventListener("dataavailable", event => {
            state.audioChunks.push(event.data);
        });

        state.mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            processAudioInput(audioBlob);
        });

        state.mediaRecorder.start();
        state.isRecording = true;
        micBtn.classList.add('recording');
        userInput.placeholder = "Listening...";
    } catch (err) {
        console.error("Error starting recorder:", err);
        alert("Error starting recording.");
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.isRecording = false;
        micBtn.classList.remove('recording');
        userInput.placeholder = "Processing...";
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1]; // Remove "data:audio/webm;base64,"
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function processAudioInput(audioBlob) {
    try {
        const base64Audio = await blobToBase64(audioBlob);

        // Optimistically add a "Voice Message" indicator or handle it in response
        // For now, let's just show "..."

        if (state.isDemo && !state.apiKey) {
            addMessage('user', "(Voice Message)");
            setTimeout(() => {
                addMessage('ai', "I heard you! (Enable API Key for real voice understanding)");
            }, 1000);
            userInput.placeholder = "Type or click mic to speak...";
            return;
        }

        // Real API Call with Audio
        const response = await callGeminiAPI(null, base64Audio);

        // We might want to transcribe what the user said if the model returns it?
        // Current Gemini generateContent doesn't return ASR transcript in content.
        // We'll just show the AI response.
        addMessage('user', "(Voice Input)");
        addMessage('ai', response);

        userInput.placeholder = "Type or click mic to speak...";

    } catch (error) {
        console.error(error);
        addMessage('ai', "Error processing voice input.");
        userInput.placeholder = "Type or click mic to speak...";
    }
}


// AI Logic (Mock vs Real)
async function generateResponse(userText) {
    if (state.isDemo && !state.apiKey) {
        // Mock Response Logic based on Level
        const mockResponses = getMockResponse(state.currentLevel, userText);
        addMessage('ai', mockResponses);
    } else {
        // Real API Call
        try {
            const response = await callGeminiAPI(userText, null);
            addMessage('ai', response);
        } catch (error) {
            addMessage('ai', "Error connecting to AI. Please check your API key.");
        }
    }
}

function getMockResponse(level, text) {
    // Simple logic to mimic levels
    const responses = [
        "That's interesting! Tell me more.",
        "I understand. How does that make you feel?",
        "Could you explain that in a different way?",
        "That is a great point.",
        "Let's discuss this further."
    ];

    let prefix = "";
    if (level === 'A1' || level === 'A2') prefix = "(Simple English) ";
    if (level === 'C1' || level === 'C2') prefix = "(Advanced Analysis) ";

    return prefix + responses[Math.floor(Math.random() * responses.length)];
}

// Settings & Utilities
function toggleSettings() {
    settingsModal.classList.toggle('hidden');
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        state.apiKey = key;
        state.isDemo = false;
        alert("API Key Saved!");
    } else {
        localStorage.removeItem('gemini_api_key');
        state.apiKey = '';
        state.isDemo = true;
        alert("Switched to Demo Mode");
    }
    toggleSettings();
}

// API Calls
async function callGeminiAPI(text, audioBase64) {
    // NOTE: This is a client-side call which exposes the key if inspecting network.
    // For a real app, use a backend proxy. For this local tool, it's okay.

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${state.apiKey}`;

    const systemInstruction = `You are an English Tutor for a student with CEFR level ${state.currentLevel}.
    Adjust your vocabulary to match level ${state.currentLevel}.
    Keep responses concise and helpful.`;

    // Construct parts
    const parts = [];
    if (audioBase64) {
        // Audio input
        parts.push({
            inline_data: {
                mime_type: "audio/webm",
                data: audioBase64
            }
        });
        parts.push({ text: "Respond to this audio." });
    } else if (text) {
        parts.push({ text: text });
    }

    const payload = {
        contents: [{ parts: parts }],
        system_instruction: { parts: [{ text: systemInstruction }] } // System instruction is supported in v1beta
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// Analysis & Export
function renderTranscript() {
    fullTranscriptDiv.innerHTML = state.messages.map(m =>
        `<strong>${m.sender === 'user' ? 'You' : 'AI'}:</strong> ${m.text}`
    ).join('<br><br>');
}

async function generateFeedback() {
    if (state.isDemo && !state.apiKey) {
        aiFeedbackDiv.textContent = "Feedback is only available with a valid API Key.";
        return;
    }

    const conversation = state.messages.map(m => `${m.sender}: ${m.text}`).join('\n');
    const prompt = `Analyze this english conversation for a student at level ${state.currentLevel}.
    Point out 3 major mistakes (grammar/vocabulary) and suggest corrections.
    Be encouraging.

    Conversation:
    ${conversation}`;

    try {
        // Reuse callGeminiAPI logic but with different prompt
        // Or construct a one-off call
        const feedback = await callGeminiAPI(prompt, null); // Using same function is fine, the system instruction will still apply which is okay-ish, or we can override it if we refactor.
        // Ideally we should override system instruction for feedback, but for simplicity let's rely on the prompt strength.
        aiFeedbackDiv.textContent = feedback;
    } catch (e) {
        aiFeedbackDiv.textContent = "Error generating feedback.";
    }
}

async function saveToSheets() {
    const url = sheetsUrlInput.value.trim();
    if (!url) {
        alert("Please enter a valid Google Sheets Web App URL.");
        return;
    }

    const payload = {
        date: new Date().toISOString(),
        level: state.currentLevel,
        messages: state.messages,
        feedback: aiFeedbackDiv.textContent
    };

    try {
        // Use no-cors mode for Google Apps Script usually, but then we can't read response.
        // Standard fetch for simple POST.
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert("Sent to Sheets! (Check your sheet)");
    } catch (e) {
        console.error(e);
        alert("Error sending to sheets. Check console.");
    }
}

// Ensure voices are loaded for TTS
window.speechSynthesis.onvoiceschanged = () => {
    // Just readying voices
};

init();
