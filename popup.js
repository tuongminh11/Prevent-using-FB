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
    
    chrome.storage.local.set(settings, () => {
        alert("Settings saved!");
    });
    chrome.storage.local.get(null, (data)=>{
        console.log(data);
    });
};


// Load saved settings
window.onload = () => {

    chrome.storage.local.get(["url","timeLimit","action"], (data) => {

        if(data.url)
            document.getElementById("url").value = data.url;

        if(data.timeLimit)
            document.getElementById("time").value = data.timeLimit / 60;

        if(data.action)
            document.querySelector(
                `input[value="${data.action}"]`
            ).checked = true;

    });

};