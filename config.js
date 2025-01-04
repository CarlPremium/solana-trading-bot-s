const config = {
    liquidityPool: {
        ignore_pump_fun: true,
        raydium_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        wsol_pc_mint: "So11111111111111111111111111111111111111112"
    },
    tx: {
        get_retry_interval: 750,
        get_retry_timeout: 20000,
    },
    swap: {
        amount: "100000000",
        slippageBps: "200",
    },
    rug_check: {
        single_holder_ownership: 30,
        not_allowed: ["Freeze Authority still enabled", "Large Amount of LP Unlocked", "Copycat token"]
    }
};

module.exports = {
    config
};

