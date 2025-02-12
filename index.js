const WebSocket = require("ws");
const dotenv = require("dotenv");
const { config } = require("./config");
const { 
    fetchTransactionDetails, 
    createSwapTransaction, 
    getRugCheckConfirmed, 
    fetchAndSaveSwapDetails 
} = require("./transactions");


dotenv.config();

function sendRequest(ws) {
    const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [
            {
                mentions: [config.liquidityPool.radiyum_program_id],
            },
            {
                commitment: "processed",
            },
        ],
    };
    ws.send(JSON.stringify(request));
}

let init = false;
async function websocketHandler() {
    let ws = new WebSocket(process.env.HELIUS_WEBSOCKET_URI || "");
    let transactionOngoing = false;
    if (!init) console.clear();

    ws.on("open", () => {
        if (ws) sendRequest(ws);
        console.log("\n🔓 WebSocket is open and listening.");
        init = true;
    });

    ws.on("message", async (data) => {
        try {
            const jsonString = data.toString();
            const parsedData = JSON.parse(jsonString);

            const logs = parsedData?.params?.result?.value?.logs;
            const signature = parsedData?.params?.result?.value?.signature;

            if (Array.isArray(logs)) {
                const containsCreate = logs.some(log => 
                    typeof log === "string" && 
                    log.includes("Program log: initialize2: InitializeInstruction2")
                );

                if (!containsCreate || typeof signature !== "string") return;

                transactionOngoing = true;
                if (ws) ws.close(1000, "Handing transactions.");

                console.log("==========================================");
                console.log("🔎 New Liquidity Pool found.");
                console.log("🔐 Pause Websocket to handle transaction.");

                console.log("🔃 Fetching transaction details ...");
                const data = await fetchTransactionDetails(signature);

                if (!data) {
                    console.log("⛔ Transaction aborted. No transaction data returned.");
                    console.log("==========================================");
                    return websocketHandler();
                }

                if (!data.solMint || !data.tokenMint) return;

                const isRugCheckPassed = await getRugCheckConfirmed(data.tokenMint);
                if (!isRugCheckPassed) {
                    console.log("🚫 Rug Check not passed! Transaction aborted.");
                    console.log("==========================================");
                    return websocketHandler();
                }

                if (data.tokenMint.trim().toLowerCase().endsWith("pump") && 
                    config.liquidity_pool.ignore_pump_fun) {
                    console.log("🚫 Transaction skipped. Ignoring Pump.fun.");
                    console.log("==========================================");
                    return websocketHandler();
                }

                console.log("💰 Token found: https://gmgn.ai/sol/token/" + data.tokenMint);
                const tx = await createSwapTransaction(data.solMint, data.tokenMint);

                if (!tx) {
                    console.log("⛔Transaction aborted. No valid transaction id returned.");
                    return websocketHandler();
                }

                console.log("✅ Swap quote recieved.");
                console.log("🚀 Swapping SOL for Token.");
                console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

                const saveConfirmation = await fetchAndSaveSwapDetails(tx);
                if (!saveConfirmation) {
                    console.log("❌ Warning: Transaction not saved for tracking! Track Manually!");
                }

                return websocketHandler();
            }
        } catch (error) {
            console.error("Error parsing JSON or processing data:", error);
        }
    });

    ws.on("error", (err) => {
        console.error("WebSocket error:", err);
    });

    ws.on("close", () => {
        ws = null;
        if (!transactionOngoing) {
            console.log("WebSocket is closed. Restarting in 5 seconds...");
            setTimeout(websocketHandler, 5000);
        }
    });
}

websocketHandler();


