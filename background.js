let timeSpent = 0;

setInterval(() => {

    chrome.storage.local.get(["url","timeLimit","action"], (config) => {

        if(!config.url) return;

        chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {

            if(!tabs[0]) return;

            let url = tabs[0].url;

            if(url.includes(config.url)){
                if(url.includes('https://www.facebook.com/messages')){
                    return;
                }

                timeSpent++;
                console.log(`Time spent on ${config.url}: ${timeSpent} seconds`);
                if(timeSpent >= config.timeLimit){

                    if(config.action === "notify"){
                        let new_settings = {
                            url: config.url,
                            timeLimit: Math.max(10, config.timeLimit / 2),
                            action: config.action
                        };
                        chrome.storage.local.set(new_settings);
                        timeSpent = 0;
                        
                        let noti_options = {
                            type: 'basic',
                            title: "Time limit reached",
                            iconUrl: "lizzard.png",
                            message: "You spent too long on this site"
                        };
                        chrome.notifications.create(noti_options);
                    }

                    if(config.action === "block"){
                        let noti_options = {
                            type: 'basic',
                            title: "Time limit reached",
                            iconUrl: "lizzard.png",
                            message: "You spent too long on this site"
                        };
                        chrome.notifications.create(noti_options);
                        let new_settings = {
                            url: config.url,
                            timeLimit: 0,
                            action: config.action
                        };
                        chrome.storage.local.set(new_settings);
                        chrome.tabs.update(tabs[0].id,{
                            url:"about:blank"
                        });

                    }

                    timeSpent = 0;
                }

            }else{
                timeSpent = 0;
            }

        });

    });

},1000);