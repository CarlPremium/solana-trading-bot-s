const axios = require("axios");
const { Connection, Keypair, VersionedTransaction } = require("@solana/web3.js");
const { Wallet } = require("@project-serum/anchor");
const bs58 = require("bs58");
const dotenv = require("dotenv");
const { config } = require("./config");
const { insertHolding, removeHolding } = require("./tracker/db");

dotenv.config();



async function fetchTransactionDetails(signature) {
    const API_URL = process.env.HELIUS_TRANSACTION_URI || "";
    const startTime = Date.now();

    while (Date.now() - startTime < config.tx.get_retry_timeout) {
        try {
            const response = await axios.post(
                API_URL,
                { transactions: [signature] },
                {
                    headers: {
                        "Content-Type": "application/json"
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.length > 0) {
                const transactions = response.data;
                const instructions = transactions[0]?.instructions;

                if (!instructions || instructions.length === 0) {
                    console.log("no instructions found. Skipping LP.");
                    return null;
                }

                const instruction = instructions.find(ix => 
                    ix.programId === config.liquidity_pool.radiyum_program_id
                );

                if (!instruction || !instruction.accounts) {
                    console.log("no instruction found. Skipping LP.");
                    return null;
                }

                const accounts = instruction.accounts;
                const accountOne = accounts[8];
                const accountTwo = accounts[9];
                let solTokenAccount = "";
                let newTokenAccount = "";

                if (accountOne === config.liquidity_pool.wsol_pc_mint) {
                    solTokenAccount = accountOne;
                    newTokenAccount = accountTwo;
                } else {
                    solTokenAccount = accountTwo;
                    newTokenAccount = accountOne;
                }

                return {
                    tokenMint: newTokenAccount,
                    solMint: solTokenAccount
                };
            }
        } catch (error) {
            console.error("Error during request:", error.message);
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, config.tx.get_retry_interval));
    }

    console.log("Timeout exceeded. No data returned.");
    return null;
}




async function createSwapTransaction(solMint, tokenMint) {
    const quoteUrl = process.env.JUP_QUOTE_API || "";
    const swapUrl = process.env.JUP_SWAP_API || "";
    const rpcUrl = process.env.HELIUS_MAINNET_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.default.decode(process.env.WALLET_PRIVATE_KEY || "")));
    let quoteResponseData = null;
    let serializedQuoteResponseData = null;

    let retryCount = 0;
    while (retryCount < config.swap.token_not_tradable_400_error_retries) {
        try {
            const quoteResponse = await axios.get(quoteUrl, {
                params: {
                    inputMint: solMint,
                    outputMint: tokenMint,
                    amount: config.swap.amount,
                    slippageBps: config.swap.slippageBps,
                },
                timeout: config.tx.get_timeout,
            });

            if (!quoteResponse.data) return null;

            if (config.swap.verbose_log) {
                console.log("\nVerbose log:");
                console.log(quoteResponse.data);
            }

            quoteResponseData = quoteResponse.data;
            break;
        } catch (error) {
            if (error.response && error.response.status === 400) {
                if (error.response.data.errorCode === "TOKEN_NOT_TRADABLE") {
                    retryCount++;
                    await new Promise(resolve => 
                        setTimeout(resolve, config.swap.token_not_tradable_400_error_delay)
                    );
                    continue;
                }
            }

            console.error("Error while requesting a new swap quote:", error.message);
            if (config.swap.verbose_log) {
                console.log("Verbose Error Message:");
                if (error.response) {
                    console.error("Error Status:", error.response.status);
                    console.error("Error Status Text:", error.response.statusText);
                    console.error("Error Data:", error.response.data);
                    console.error("Error Headers:", error.response.headers);
                } else if (error.request) {
                    console.error("No Response:", error.request);
                } else {
                    console.error("Error Message:", error.message);
                }
            }
            return null;
        }
    }

    try {
        if (!quoteResponseData) return null;

        const swapResponse = await axios.post(
            swapUrl,
            JSON.stringify({
                quoteResponse: quoteResponseData,
                userPublicKey: myWallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicSlippage: {
                    maxBps: 300,
                },
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: config.swap.prio_fee_max_lamports,
                        priorityLevel: config.swap.prio_level,
                    },
                },
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: config.tx.get_timeout,
            }
        );

        if (!swapResponse.data) return null;

        if (config.swap.verbose_log) {
            console.log(swapResponse.data);
        }

        serializedQuoteResponseData = swapResponse.data;
        return serializedQuoteResponseData;
    } catch (error) {
        console.error("Error while sending the swap quote:", error.message);
        if (config.swap.verbose_log) {
            console.log("Verbose Error Message:");
            if (error.response) {
                console.error("Error Status:", error.response.status);
                console.error("Error Status Text:", error.response.statusText);
                console.error("Error Data:", error.response.data);
                console.error("Error Headers:", error.response.headers);
            } else if (error.request) {
                console.error("No Response:", error.request);
            } else {
                console.error("Error Message:", error.message);
            }
        }
        return null;
    }
}



  



async function getRugCheckConfirmed(tokenMint) {
    const rugResponse = await axios.get("https://api.rugcheck.xyz/v1/tokens/" + tokenMint + "/report/summary", {
        timeout: config.tx.get_timeout,
    });

    if (!rugResponse.data) return false;

    if (config.rug_check.verbose_log) {
        console.log(rugResponse.data);
    }

    for (const risk of rugResponse.data.risks) {
        if (risk.name === "Single holder ownership") {
            const numericValue = parseFloat(risk.value.replace("%", ""));
            if (numericValue > config.rug_check.single_holder_ownership) {
                return false;
            }
        }
        if (risk.name === "Low Liquidity") {
            const numericValue = parseFloat(risk.value.replace("%", ""));
            if (numericValue > config.rug_check.low_liquidity) {
                return false;
            }
        }
    }

    function isRiskAcceptable(tokenDetails) {
        const notAllowed = config.rug_check.not_allowed;
        return !tokenDetails.risks.some(risk => notAllowed.includes(risk.name));
    }

    return isRiskAcceptable(rugResponse.data);
}




async function fetchAndSaveSwapDetails(tx) {
    const txUrl = process.env.HELIUS_TRANSACTION_URI || "";
    const priceUrl = process.env.JUP_PRICE_API || "";
    const rpcUrl = process.env.HELIUS_MAINNET_URI || "";

    try {
        const response = await axios.post(
            txUrl,
            { transactions: [tx] },
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 10000
            }
        );

        if (!response.data || response.data.length === 0) {
            console.log("⛔ Could not fetch swap details: No response received from API.");
            return false;
        }

        const transactions = response.data;
        const swapTransactionData = {
            programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
            tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
            tokenOutputs: transactions[0]?.events.swap.innerSwaps[0].tokenOutputs,
            fee: transactions[0]?.fee,
            slot: transactions[0]?.slot,
            timestamp: transactions[0]?.timestamp,
            description: transactions[0]?.description,
        };

        const solMint = config.liquidity_pool.wsol_pc_mint;
        const priceResponse = await axios.get(priceUrl, {
            params: {
                ids: solMint,
            },
            timeout: config.tx.get_timeout,
        });

        if (!priceResponse.data.data[solMint]?.price) return false;

        const solUsdcPrice = priceResponse.data.data[solMint]?.price;
        const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
        const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
        const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

        const metadataReponse = await axios.post(
            rpcUrl,
            JSON.stringify({
                jsonrpc: "2.0",
                id: "test",
                method: "getAsset",
                params: {
                    id: swapTransactionData.tokenOutputs[0].mint,
                },
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: config.tx.get_timeout,
            }
        );

        const tokenName = metadataReponse?.data?.result?.content?.metadata?.name || "N/A";

        const newHolding = {
            Time: swapTransactionData.timestamp,
            Token: swapTransactionData.tokenOutputs[0].mint,
            TokenName: tokenName,
            Balance: swapTransactionData.tokenOutputs[0].tokenAmount,
            SolPaid: swapTransactionData.tokenInputs[0].tokenAmount,
            SolFeePaid: swapTransactionData.fee,
            SolPaidUSDC: solPaidUsdc,
            SolFeePaidUSDC: solFeePaidUsdc,
            PerTokenPaidUSDC: perTokenUsdcPrice,
            Slot: swapTransactionData.slot,
            Program: swapTransactionData.programInfo ? swapTransactionData.programInfo.source : "N/A",
        };

        await insertHolding(newHolding).catch(err => {
            console.log("⛔ Database Error: " + err);
            return false;
        });

        return true;
    } catch (error) {
        console.error("Error during request:", error.message);
        return false;
    }
}




async function createSellTransaction(solMint, tokenMint, amount) {
    const quoteUrl = process.env.JUP_QUOTE_API || "";
    const swapUrl = process.env.JUP_SWAP_API || "";
    const rpcUrl = process.env.HELIUS_MAINNET_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));

    try {
        const quoteResponse = await axios.get(quoteUrl, {
            params: {
                inputMint: tokenMint,
                outputMint: solMint,
                amount: amount,
                slippageBps: config.sell.slippageBps,
            },
            timeout: config.tx.get_timeout,
        });

        if (!quoteResponse.data) return null;

        const swapTransaction = await axios.post(
            swapUrl,
            JSON.stringify({
                quoteResponse: quoteResponse.data,
                userPublicKey: myWallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicSlippage: {
                    maxBps: 300,
                },
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: config.sell.prio_fee_max_lamports,
                        priorityLevel: config.sell.prio_level,
                    },
                },
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: config.tx.get_timeout,
            }
        );

        if (!swapTransaction.data) return null;

        const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        transaction.sign([myWallet.payer]);

        const connection = new Connection(rpcUrl);
        const latestBlockHash = await connection.getLatestBlockhash();

        const rawTransaction = transaction.serialize();
        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2,
        });

        if (!txid) return null;

        const conf = await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid,
        });

        if (conf.value.err || conf.value.err !== null) return null;

        removeHolding(tokenMint).catch(err => {
            console.log("⛔ Database Error: " + err);
        });

        return txid;
    } catch (error) {
        console.error("Error while creating and submitting transaction:", error.message);
        return null;
    }
}


module.exports = {
    fetchTransactionDetails,
    createSwapTransaction,
    getRugCheckConfirmed,
    fetchAndSaveSwapDetails,
    createSellTransaction,
};
