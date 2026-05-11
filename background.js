// let timeSpent = 0;

// setInterval(() => {

//     chrome.storage.local.get(["url","timeLimit","action"], (config) => {

//         if(!config.url) return;

//         chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {

//             if(!tabs[0]) return;

//             let url = tabs[0].url;

//             if(url.includes(config.url)){
//                 if(url.includes('https://www.facebook.com/messages')){
//                     return;
//                 }

//                 timeSpent++;
//                 console.log(`Time spent on ${config.url}: ${timeSpent} seconds`);
//                 if(timeSpent >= config.timeLimit){

//                     if(config.action === "notify"){
//                         let new_settings = {
//                             url: config.url,
//                             timeLimit: Math.max(10, config.timeLimit / 2),
//                             action: config.action
//                         };
//                         chrome.storage.local.set(new_settings);
//                         timeSpent = 0;

//                         let noti_options = {
//                             type: 'basic',
//                             title: "Time limit reached",
//                             iconUrl: "lizzard.png",
//                             message: "You spent too long on this site"
//                         };
//                         chrome.notifications.create(noti_options);
//                     }

//                     if(config.action === "block"){
//                         let noti_options = {
//                             type: 'basic',
//                             title: "Time limit reached",
//                             iconUrl: "lizzard.png",
//                             message: "You spent too long on this site"
//                         };
//                         chrome.notifications.create(noti_options);
//                         let new_settings = {
//                             url: config.url,
//                             timeLimit: 0,
//                             action: config.action
//                         };
//                         chrome.storage.local.set(new_settings);
//                         chrome.tabs.update(tabs[0].id,{
//                             url:"about:blank"
//                         });

//                     }

//                     timeSpent = 0;
//                 }

//             }else{
//                 timeSpent = 0;
//             }

//         });

//     });

// },1000);


// Load saved settings
window.onload = () => {
    let db;

    const registerURL = document.getElementById("url-save");
    const el_url = document.getElementById("url");
    const el_time = document.getElementById("time");
    const el_action = document.getElementById("limit-action");
    const DBOpenRequest = window.indexedDB.open("avoidURL", 4);

    // Register two event handlers to act on the database being opened successfully, or not
    DBOpenRequest.onerror = (event) => {
        console.log("Error loading database.");
    };

    DBOpenRequest.onsuccess = (event) => {
        console.log("Database initialized.");
        db = DBOpenRequest.result;
    };

    DBOpenRequest.onupgradeneeded = (event) => {
        db = event.target.result;

        db.onerror = (event) => {
            console.log("Error loading database.");
        };

        // Create an objectStore for this database
        const objectStore = db.createObjectStore("urlThreshold", {
            keyPath: "url",
        });

        // Define what data items the objectStore will contain
        objectStore.createIndex("url", "url", { unique: true });
        objectStore.createIndex("action", "action", { unique: false });

        console.log("Object urlThreshold created.");

        // Create an objectStore for this database
        const objectStore_1 = db.createObjectStore("dailyTracking");

        // Define what data items the objectStore will contain
        objectStore_1.createIndex("day", "day");
        objectStore_1.createIndex("url", "url");

        console.log("Object dailyTracking created.");
    };

    registerURL.addEventListener("click", addData);

    function addData(e) {
        e.preventDefault();
        if (el_time.value === "" || el_url === "") {
            console.log("Data not submitted — form incomplete.");
            return;
        }
        let newItem = [
            {
                "url": el_url.value,
                "time": el_time.value,
                "action": el_action.value
            }
        ]
        const transaction = db.transaction(["urlThreshold"], "readwrite");

        transaction.oncomplete = () => {
            console.log("Transaction completed: database modification finished.");
            console.log(newItem);
        };
        transaction.onerror = () => {
            console.log(`Transaction not opened due to error: ${transaction.error}`);
        };
        const objectStore = transaction.objectStore("urlThreshold");
        const objectStoreRequest = objectStore.put(newItem[0]);
        objectStoreRequest.onsuccess = (event) => {
            // Report the success of our request
            // (to detect whether it has been successfully
            // added to the database, you'd look at transaction.oncomplete)
            console.log("Request successful.");
            console.log(newItem);
            // Clear the form, ready for adding the next entry
            el_url.value = "";
            el_time.value = "";
        };
    }

    function checkLimit() {
        console.log("check limit");
        
    };

    setInterval(checkLimit, 1000);
}