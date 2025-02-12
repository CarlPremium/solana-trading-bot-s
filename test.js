const { 
  fetchTransactionDetails, 
  createSwapTransaction, 
  getRugCheckConfirmed, 
  fetchAndSaveSwapDetails, 
  createSellTransaction 
} = require("./transactions");

// Fetch Transaction Details
(async () => {
  const testId = null;
  try {
    const tx = await fetchTransactionDetails(testId);
    console.log(tx);
  } catch (error) {
    console.error('Error fetching transaction details:', error.message);
  }
})();

// Create Swap Transaction
(async () => {
  const testId = "Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump";
  try {
    if (!testId) {
      throw new Error('Transaction ID is required');
    }
    const tx = await createSwapTransaction(
      "So11111111111111111111111111111111111111112", 
      testId
    );
    console.log(tx);
  } catch (error) {
    console.error('Error creating swap transaction:', error.message);
  }
})();

// Get Rug Check Confirmation
(async () => {
  const testId = null;
  try {
    const tx = await getRugCheckConfirmed(testId);
    console.log(tx);
  } catch (error) {
    console.error('Error getting rug check confirmation:', error.message);
  }
})();

// Fetch and Save Swap Details
(async () => {
  const testId = "3SQXLu2UFTN7mfPqei2aurPwVu7jzvvzNkj7WiwTT25pkHijVozVwYavuurQu1B63V6nWJ4o2dSQuMEPMczmq82q";
  try {
    const tx = await fetchAndSaveSwapDetails(testId);
    console.log(tx);
  } catch (error) {
    console.error('Error fetching and saving swap details:', error.message);
  }
})();

// Create Sell Transaction
(async () => {
  const testId = "";
  const testAmount = "7";
  try {

    if (!testAmount || isNaN(testAmount)) {
      throw new Error('Valid amount is required');
    }
    const tx = await createSellTransaction(
      "So11111111111111111111111111111111111111112", 
      testId, 
      testAmount
    );
    console.log(tx);
  } catch (error) {
    console.error('Error creating sell transaction:', error.message);
  }
})();

