const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'https://beatmatch-jbss.onrender.com';
const NUM_PLAYERS = 3; // Host + 2 players for a quick game
const TEST_ROUNDS = 3; // Quick 3-round game for testing

function createPlayer(playerNumber, roomId) {
    return new Promise((resolve) => {
        const socket = io(BACKEND_URL, {
            withCredentials: true,
            transports: ['websocket']
        });

        let currentRound = 0;
        let answeredCurrentRound = false;

        socket.on('connect', () => {
            console.log(`👤 Player ${playerNumber} (${playerNumber === 1 ? 'Host' : 'Guest'}) connected`);
            
            socket.emit('join-game', {
                roomId: roomId,
                playerName: playerNumber === 1 ? 'Host Player' : `Guest ${playerNumber}`
            });
        });

        socket.on('player-joined', (data) => {
            console.log(`✅ ${playerNumber === 1 ? 'Host' : 'Guest ' + playerNumber} joined the room`);
            console.log('👥 Players in room:', data.players.map(p => p.name).join(', '));
            
            // Host starts the game when all players join
            if (playerNumber === 1 && data.players.length === NUM_PLAYERS) {
                console.log('🎲 All players joined! Host starting the game...');
                socket.emit('start-game', { roomId });
            }
        });

        socket.on('game-started', (data) => {
            currentRound = data.currentRound;
            answeredCurrentRound = false;
            console.log(`\n📢 Round ${currentRound} started!`);
            
            // Simulate thinking and answering
            const thinkingTime = Math.random() * 2000 + 1000; // 1-3 seconds to answer
            setTimeout(() => {
                if (!answeredCurrentRound) {
                    // Simulate different player skills
                    let isCorrect;
                    if (playerNumber === 1) {
                        isCorrect = Math.random() > 0.2; // Host is good (80% correct)
                    } else if (playerNumber === 2) {
                        isCorrect = Math.random() > 0.4; // Player 2 is decent (60% correct)
                    } else {
                        isCorrect = Math.random() > 0.5; // Player 3 is average (50% correct)
                    }

                    console.log(`🎵 ${playerNumber === 1 ? 'Host' : 'Guest ' + playerNumber} submitted their answer ${isCorrect ? '(Correct!)' : '(Wrong...)'}`);
                    socket.emit('submit-answer', {
                        roomId: roomId,
                        answer: {
                            isCorrect: isCorrect,
                            round: currentRound
                        }
                    });
                    answeredCurrentRound = true;
                }
            }, thinkingTime);
        });

        socket.on('answer-submitted', (data) => {
            const player = data.players.find(p => p.id === socket.id);
            if (player) {
                console.log(`📊 ${player.name}: Score=${player.score} | Streak=${player.streak || 0} | Correct=${player.correctAnswers}`);
            }

            // Host starts next round after all players answer
            if (playerNumber === 1 && !answeredCurrentRound && currentRound < TEST_ROUNDS) {
                setTimeout(() => {
                    console.log('\n🔄 Starting next round...');
                    socket.emit('start-game', { roomId });
                }, 2000);
                answeredCurrentRound = true;
            }
        });

        socket.on('game-ended', (data) => {
            console.log('\n🏁 Game Over!');
            console.log('🏆 Final Standings:');
            data.players
                .sort((a, b) => b.score - a.score)
                .forEach((player, index) => {
                    console.log(`${index + 1}. ${player.name}: ${player.score} points (${player.correctAnswers} correct answers)`);
                });
            console.log(`\n👑 Winner: ${data.winner.name} with ${data.winner.score} points!`);
        });

        socket.on('error', (error) => {
            console.error(`❌ Error for ${playerNumber === 1 ? 'Host' : 'Guest ' + playerNumber}:`, error.message);
        });

        resolve(socket);
    });
}

async function runQuickGame() {
    try {
        console.log('🎮 Starting a quick game test...');
        
        // Create game room
        const roomId = 'quick-test-' + Date.now();
        const response = await axios.post(`${BACKEND_URL}/api/games`, {
            roomId,
            hostName: 'Host Player'
        });
        console.log('🎯 Game room created:', roomId);

        // Connect players
        const playerSockets = [];
        for (let i = 1; i <= NUM_PLAYERS; i++) {
            const socket = await createPlayer(i, roomId);
            playerSockets.push(socket);
            // Small delay between players joining
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Keep test running for game duration
        await new Promise(resolve => setTimeout(resolve, TEST_ROUNDS * 6000));

        // Clean up
        console.log('\n👋 Game session ended, disconnecting players...');
        playerSockets.forEach(socket => {
            if (socket.connected) {
                socket.disconnect();
            }
        });
        
    } catch (error) {
        console.error('❌ Game error:', error.message);
    }
}

// Start the quick game test
runQuickGame(); 