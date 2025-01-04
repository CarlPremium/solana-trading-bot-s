const { 
  fetchTransactionDetails, 
  createSwapTransaction, 
  getRugCheckConfirmed, 
  fetchAndSaveSwapDetails, 
  createSellTransaction 
} = require("./transactions");

(async () => {
  const testId = null;
  if (testId) {
      const tx = await fetchTransactionDetails(testId);
      console.log(tx);
  }
})();

(async () => {
  const testId = "Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump";
  if (testId) {
      const tx = await createSwapTransaction(
          "So11111111111111111111111111111111111111112", 
          testId
      );
      console.log(tx);
  }
})();

(async () => {
  const testId = null;
  if (testId) {
      const tx = await getRugCheckConfirmed(testId);
      console.log(tx);
  }
})();

(async () => {
  const testId = "3SQXLu2UFTN7mfPqei2aurPwVu7jzvvzNkj7WiwTT25pkHijVozVwYavuurQu1B63V6nWJ4o2dSQuMEPMczmq82q";
  if (testId) {
      const tx = await fetchAndSaveSwapDetails(testId);
      console.log(tx);
  }
})();

(async () => {
  const testId = "";
  const testAmount = "7";
  if (testId) {
      const tx = await createSellTransaction(
          "So11111111111111111111111111111111111111112", 
          testId, 
          testAmount
      );
      console.log(tx);
  }
})();
