const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'https://beatmatch-jbss.onrender.com';
const NUM_PLAYERS = 4;
const ROUNDS = 10; // Match the server's round limit

function createPlayer(playerNumber, roomId) {
    return new Promise((resolve) => {
        const socket = io(BACKEND_URL, {
            withCredentials: true,
            transports: ['websocket']
        });

        let currentRound = 0;
        let answeredCurrentRound = false;

        socket.on('connect', () => {
            console.log(`👤 Player ${playerNumber} connected (${socket.id})`);
            
            socket.emit('join-game', {
                roomId: roomId,
                playerName: `Player ${playerNumber}`
            });
        });

        socket.on('player-joined', (data) => {
            console.log(`✅ Player ${playerNumber} joined game. Total players: ${data.players.length}`);
            console.log('Current players:', data.players.map(p => p.name).join(', '));
            
            if (playerNumber === 1 && data.players.length === NUM_PLAYERS + 1) {
                console.log('🎲 All players joined, starting game...');
                socket.emit('start-game', { roomId });
            }
        });

        socket.on('game-started', (data) => {
            currentRound = data.currentRound;
            answeredCurrentRound = false;
            console.log(`🎯 Game started for Player ${playerNumber}. Round: ${currentRound}/${data.totalRounds}`);
            
            // Simulate different answer timings and correctness patterns
            const answerDelay = Math.random() * 2000 + 500; // Random delay between 0.5-2.5 seconds
            setTimeout(() => {
                if (!answeredCurrentRound) {
                    // Players have different accuracy patterns
                    let isCorrect;
                    switch(playerNumber) {
                        case 1: // Consistently good player
                            isCorrect = Math.random() > 0.2; // 80% correct
                            break;
                        case 2: // Average player
                            isCorrect = Math.random() > 0.4; // 60% correct
                            break;
                        case 3: // Streaky player
                            isCorrect = Math.random() > (currentRound % 2 ? 0.1 : 0.7); // Alternates between 90% and 30% correct
                            break;
                        default: // Random player
                            isCorrect = Math.random() > 0.5; // 50% correct
                    }

                    console.log(`📝 Player ${playerNumber} submitting answer for round ${currentRound} (${isCorrect ? 'correct' : 'incorrect'})`);
                    socket.emit('submit-answer', {
                        roomId: roomId,
                        answer: {
                            isCorrect: isCorrect,
                            round: currentRound
                        }
                    });
                    answeredCurrentRound = true;
                }
            }, answerDelay);
        });

        socket.on('answer-submitted', (data) => {
            const player = data.players.find(p => p.name === `Player ${playerNumber}`);
            if (player) {
                console.log(`✨ Answer processed for Player ${playerNumber} in round ${currentRound}`);
                console.log(`📊 Score: ${player.score}, Streak: ${player.streak}, Correct Answers: ${player.correctAnswers}`);
            }

            // If this is player 1 (host), they'll start the next round after all players have answered
            if (playerNumber === 1 && !answeredCurrentRound && currentRound < ROUNDS) {
                setTimeout(() => {
                    console.log(`🔄 Starting round ${currentRound + 1}...`);
                    socket.emit('start-game', { roomId });
                }, 2000);
                answeredCurrentRound = true;
            }
        });

        socket.on('game-ended', (data) => {
            console.log('🏁 Game Over!');
            console.log('Final Standings:');
            data.players.forEach((player, index) => {
                console.log(`${index + 1}. ${player.name}: ${player.score} points (${player.correctAnswers} correct answers)`);
            });
            console.log(`🏆 Winner: ${data.winner.name} with ${data.winner.score} points!`);
        });

        socket.on('error', (error) => {
            console.error(`❌ Error for Player ${playerNumber}:`, error.message);
        });

        // Resolve the promise with the socket for cleanup
        resolve(socket);
    });
}

async function runMultiplayerTest() {
    try {
        console.log(`🚀 Starting multiplayer test with ${NUM_PLAYERS} players...`);
        
        // Create a game room
        const roomId = 'test-room-' + Date.now();
        const response = await axios.post(`${BACKEND_URL}/api/games`, {
            roomId,
            hostName: 'Host Player'
        });
        console.log('🎮 Game created:', response.data);
        console.log(`📋 Room ID: ${roomId}`);

        // Create multiple players
        const playerSockets = [];
        for (let i = 1; i <= NUM_PLAYERS; i++) {
            const socket = await createPlayer(i, roomId);
            playerSockets.push(socket);
            // Stagger player joins
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Keep the test running until game completion
        await new Promise(resolve => setTimeout(resolve, ROUNDS * 5000));

        // Cleanup: disconnect all players
        console.log('Disconnecting players...');
        playerSockets.forEach(socket => {
            if (socket.connected) {
                socket.disconnect();
            }
        });
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

// Run the test
runMultiplayerTest(); 