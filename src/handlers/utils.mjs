
let delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const with_backoff = async (f, retries, condition) => {
    for (let retryCount = 0; retryCount < retries; retryCount++) {
        try {
            let res = await f();
            return res
        } catch (e) {
            console.log(e.toString(), e.toString().includes(condition))
            if (e.toString().includes(condition)) {
                console.log(`retrying ${retryCount}`, e.toString())
                await delay(2 ** retries + Math.random() * 50);
            } else {
                throw e
            }
        }
    }

    throw new Error(`with_backoff failed after ${retries} retries`)
};
