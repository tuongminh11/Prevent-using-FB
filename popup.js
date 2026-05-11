document.getElementById("save").onclick = () => {

    const url = document.getElementById("url").value;
    const time = document.getElementById("time").value;

    const action = document.querySelector(
        'input[name="action"]:checked'
    ).value;

    const settings = {
        url: url,
        timeLimit: time * 60,
        action: action
    };

    const DBOpenRequest = window.indexedDB.open("avoidFB", 4);

    // Register two event handlers to act on the database being opened successfully, or not
    DBOpenRequest.onerror = (event) => {
        console.log("Error loading database.")
    };

    DBOpenRequest.onsuccess = (event) => {
       console.log("Database initialized.");
    };


    // chrome.storage.local.set(settings, () => {
    //     alert("Settings saved!");
    // });
    // chrome.storage.local.get(null, (data)=>{
    //     console.log(data);
    // });
};


// Load saved settings
window.onload = () => {
    let db;
    
    const DBOpenRequest = window.indexedDB.open("avoidFB", 4);

    // Register two event handlers to act on the database being opened successfully, or not
    DBOpenRequest.onerror = (event) => {
        console.log("Error loading database.")
    };

    DBOpenRequest.onsuccess = (event) => {
       console.log("Database initialized.");
    };

    DBOpenRequest.onupgradeneeded = (event) => {
        const buf = event.target.result;
        const objectStore = buf.createObjectStore("URLthreshold", { keyPath: ["url", "limit"] });

        objectStore.createIndex("url_idx", "url");
        
        objectStore.transaction.oncomplete = (event) => {
            // Store values in the newly created objectStore.
            const urlThresholdObjectStore = buf
                .transaction("URLthreshold", "readwrite")
                .objectStore("URLthreshold");
        };
    }

    // chrome.storage.local.get(["url","timeLimit","action"], (data) => {

    //     if(data.url)
    //         document.getElementById("url").value = data.url;

    //     if(data.timeLimit)
    //         document.getElementById("time").value = data.timeLimit / 60;

    //     if(data.action)
    //         document.querySelector(
    //             `input[value="${data.action}"]`
    //         ).checked = true;

    // });

};