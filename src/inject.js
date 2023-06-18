function greetings() {
    let date = new Date();
    hour = date.getHours();

    if (hour >= 0 && hour < 12) {
        return "Good Morning";
    }

    if (hour >= 12 && hour < 18) {
        return "Good evening";
    }

    if (hour >= 18 && hour < 24) {
        return "Good night";
    }
}

async function downloadFile(message) {
    let filename = ''
    if (message.type === "document") {
        filename = `${message.filename.split(".")[0]}_${Math.random().toString(36).substring(4)}`
    } else if (message.type === "image" || message.type === "video" || message.type === "ptt" || message.type === "audio") {
        filename = `${message.chatId.user}_${Math.random().toString(36).substring(4)}`
    } else {
        window.log("couldn't recognize message type. Skipping download")
        return
    }
    const buffer = await WAPI.downloadBuffer(message.deprecatedMms3Url)
    const decrypted = await window.Store.CryptoLib.decryptE2EMedia(message.type, buffer, message.mediaKey, message.mimetype);
    const data = await window.WAPI.readBlobAsync(decrypted._blob);
    saveFile(data.split(',')[1], filename, message.mimetype)
    return data;
}

//Updating string prototype to support variables
String.prototype.fillVariables = String.prototype.fillVariables ||
    function () {
        "use strict";
        var str = this.toString();
        if (arguments.length) {
            var t = typeof arguments[0];
            var key;
            var args = ("string" === t || "number" === t) ?
                Array.prototype.slice.call(arguments)
                : arguments[0];

            for (key in args) {
                str = str.replace(new RegExp("\\[#" + key + "\\]", "gi"), args[key]);
            }
        }

        return str;
    };

//check if there is pending unread messages. if yes then push it to data
if (intents.appconfig.replyUnreadMsg) {
    // check for pending unread messages
    log("=====> Keep in mind that bot will reply to unread messages but you have to manually mark them as seen.")
    WAPI.getUnreadMessages(false, true, true, (messages) => {
        let processData = []
        data = messages.filter((m) => !m.archive)
        for (let i = 0; i < data.length; i++) {
            const element = data[i];
            for (let j = 0; j < element.messages.length; j++) {
                const message = element.messages[j];
                processData.push(message)
            }
        }
        console.log(processData)
        // processMessages(processData)
        processMessages1(processData)
    })
}

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};

async function waitBeforeSending(exactMatch, PartialMatch) {
    if (exactMatch || PartialMatch) {
        if ((exactMatch || PartialMatch).afterSeconds) {
            await delay((exactMatch || PartialMatch).afterSeconds * 1000)
        }
    }
}

async function processWebhook(webhook, message, body) {
    //if message is image then download it first and then call an webhook
    if (message.type == "image") {
        body.base64DataFile = await downloadFile(message)
    }
    fetch(webhook, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json'
        }
    }).then((resp) => resp.json()).then(function (response) {
        //response received from server
        console.log(response);
        WAPI.sendSeen(message.chatId._serialized);
        //replying to the user based on response
        if (response && response.length > 0) {
            response.forEach(itemResponse => {
                itemResponse.text = itemResponse.text.fillVariables({ name: message.sender.pushname, phoneNumber: message.sender.id.user, greetings: greetings() });
                WAPI.sendMessage2(message.chatId._serialized, itemResponse.text);
                //sending files if there is any 
                if (itemResponse.files && itemResponse.files.length > 0) {
                    itemResponse.files.forEach((itemFile) => {
                        WAPI.sendImage(itemFile.file, message.chatId._serialized, itemFile.name);
                    })
                }
            });
        }
    }).catch(function (error) {
        console.log(error);
    });
}

async function processMessages(data) {
    for (let i = 0; i < data.length; i++) {
        //fetch API to send and receive response from server
        let message = data[i];
        body = {};
        body.text = message.body;
        body.type = 'message';
        body.user = message.chatId._serialized;
        //body.original = message;
        if (intents.appconfig.downloadMedia) {
            downloadFile(message)
        }
        //global webhook, this will be called no matter what if this is not blank
        if (intents.appconfig.webhook) {
            window.log("Processing global webhook")
            processWebhook(intents.appconfig.webhook, message, body)
        }
        window.log(`Message from ${message.chatId.user} checking..`);
        if (intents.blocked.indexOf(message.chatId.user) >= 0) {
            window.log("number is blocked by BOT. no reply");
            continue;
        }
        if (message.type == "chat") {
            //message.isGroupMsg to check if this is a group
            if (message.isGroupMsg == true && intents.appconfig.isGroupReply == false) {
                window.log("Message received in group and group reply is off. so will not take any actions.");
                continue;
            }
            var exactMatch = intents.bot.find(obj => obj.exact.find(ex => ex == message.body.toLowerCase()));
            var response = "";
            if (exactMatch != undefined) {
                response = await resolveSpintax(exactMatch.response);
                window.log(`Replying with ${response}`);
            }
            var PartialMatch = intents.bot.find(obj => obj.contains.find(ex => message.body.toLowerCase().search(ex) > -1));
            if (PartialMatch != undefined) {
                response = await resolveSpintax(PartialMatch.response);
                window.log(`Replying with ${response}`);
            }
            WAPI.sendSeen(message.chatId._serialized);
            response = response.fillVariables({ name: message.sender.pushname, phoneNumber: message.sender.id.user, greetings: greetings() })
            await waitBeforeSending(exactMatch, PartialMatch)
            if (exactMatch != undefined || PartialMatch != undefined) {

                // sending file if there is any
                // else send only response
                if ((exactMatch || PartialMatch).file != undefined) {
                    var captionStatus = (exactMatch || PartialMatch).responseAsCaption;
                    // We consider undefined responseAsCaption as a false
                    if (captionStatus == undefined) {
                        captionStatus = false;
                    }

                    files = await resolveSpintax((exactMatch || PartialMatch).file);

                    // if responseAsCaption is true, send image with response as a caption
                    // else send image and response seperately
                    if (captionStatus == true) {
                        window.getFile(files).then((base64Data) => {
                            // send response in place of caption as a last argument in below function call
                            WAPI.sendImage(base64Data, message.chatId._serialized, files, response);
                        }).catch((error) => {
                            window.log("Error in sending file\n" + error);
                        });
                    } else {
                        window.log("Either the responseAsCaption is undefined or false, Make it true to allow caption to a file");
                        window.getFile(files).then((base64Data) => {
                            // send blank in place of caption as a last argument in below function call
                            WAPI.sendImage(base64Data, message.chatId._serialized, files, "");
                        }).catch((error) => {
                            window.log("Error in sending file\n" + error);
                        });
                        WAPI.sendMessage2(message.chatId._serialized, response);
                    }
                } else {
                    // We just need to send the response as we already checked no file is attached (in above if)
                    WAPI.sendMessage2(message.chatId._serialized, response);
                }

                //call a webhook if there is one in (exactMatch || PartialMatch)
                if ((exactMatch || PartialMatch).webhook) {
                    //okay there is a webhook so let's call it
                    window.log("Processing webhook from block")
                    processWebhook((exactMatch || PartialMatch).webhook, message, body)
                }
            } else {
                // We are sure we haven't found any exact or partial match
                // as we are already checking it in the above if statement
                // So process with the noMatch logic only
                response = await resolveSpintax(intents.noMatch);
                window.log(`No exact or partial match found. So replying with ${response} instead`);
                WAPI.sendMessage2(message.chatId._serialized, response);
            }
        }
    }
}


async function processMessages1(data) {
    for (let i = 0; i < data.length; i++) {
        //fetch API to send and receive response from server
        let message = data[i];
        body = {};
        body.text = message.body;
        body.type = 'message';
        body.user = message.chatId._serialized;
        //body.original = message;
        if (intents.appconfig.downloadMedia) {
            downloadFile(message)
        }
        //global webhook, this will be called no matter what if this is not blank
        if (intents.appconfig.webhook) {
            console.log("Processing global webhook")
            processWebhook(intents.appconfig.webhook, message, body)
        }
        console.log(`Message from ${message.chatId.user} checking..`);
        if (intents.blocked.indexOf(message.chatId.user) >= 0) {
            console.log("number is blocked by BOT. no reply");
            continue;
        }
        if (message.type == "chat") {
            console.log("message", message);

            // //message.isGroupMsg to check if this is a group
            // if (message.isGroupMsg == true && intents.appconfig.isGroupReply == false) {
            //     window.log("Message received in group and group reply is off. so will not take any actions.");
            //     continue;
            // }
            // var exactMatch = intents.bot.find(obj => obj.exact.find(ex => ex == message.body.toLowerCase()));
            // var response = "";
            // if (exactMatch != undefined) {
            //     response = await resolveSpintax(exactMatch.response);
            //     window.log(`Replying with ${response}`);
            // }
            // var PartialMatch = intents.bot.find(obj => obj.contains.find(ex => message.body.toLowerCase().search(ex) > -1));
            // if (PartialMatch != undefined) {
            //     response = await resolveSpintax(PartialMatch.response);
            //     window.log(`Replying with ${response}`);
            // }
            // WAPI.sendSeen(message.chatId._serialized);
            // response = response.fillVariables({ name: message.sender.pushname, phoneNumber: message.sender.id.user, greetings: greetings() })
            // await waitBeforeSending(exactMatch, PartialMatch)
            // if (exactMatch != undefined || PartialMatch != undefined) {

            //     // sending file if there is any
            //     // else send only response
            //     if ((exactMatch || PartialMatch).file != undefined) {
            //         var captionStatus = (exactMatch || PartialMatch).responseAsCaption;
            //         // We consider undefined responseAsCaption as a false
            //         if (captionStatus == undefined) {
            //             captionStatus = false;
            //         }

            //         files = await resolveSpintax((exactMatch || PartialMatch).file);

            //         // if responseAsCaption is true, send image with response as a caption
            //         // else send image and response seperately
            //         if (captionStatus == true) {
            //             window.getFile(files).then((base64Data) => {
            //                 // send response in place of caption as a last argument in below function call
            //                 WAPI.sendImage(base64Data, message.chatId._serialized, files, response);
            //             }).catch((error) => {
            //                 window.log("Error in sending file\n" + error);
            //             });
            //         } else {
            //             window.log("Either the responseAsCaption is undefined or false, Make it true to allow caption to a file");
            //             window.getFile(files).then((base64Data) => {
            //                 // send blank in place of caption as a last argument in below function call
            //                 WAPI.sendImage(base64Data, message.chatId._serialized, files, "");
            //             }).catch((error) => {
            //                 window.log("Error in sending file\n" + error);
            //             });
            //             WAPI.sendMessage2(message.chatId._serialized, response);
            //         }
            //     } else {
            //         // We just need to send the response as we already checked no file is attached (in above if)
            //         WAPI.sendMessage2(message.chatId._serialized, response);
            //     }

            //     //call a webhook if there is one in (exactMatch || PartialMatch)
            //     if ((exactMatch || PartialMatch).webhook) {
            //         //okay there is a webhook so let's call it
            //         window.log("Processing webhook from block")
            //         processWebhook((exactMatch || PartialMatch).webhook, message, body)
            //     }
            // } else {
            //     // We are sure we haven't found any exact or partial match
            //     // as we are already checking it in the above if statement
            //     // So process with the noMatch logic only
            //     response = await resolveSpintax(intents.noMatch);
            //     window.log(`No exact or partial match found. So replying with ${response} instead`);
            //     WAPI.sendMessage2(message.chatId._serialized, response);
            // }










            try {

                setTimeout(async () => {

                    try {
                        // // var getAllChatsWithNewMsg = await WAPI.getAllChats();
                        // var getAllChatsWithNewMsg = await WAPI.getAllChatsWithNewMsg();
                        // console.log(getAllChatsWithNewMsg);
                        // var els = document.querySelectorAll("._3m_Xw");
                        // console.log(els);
                        // // var x = els.length;
                        // if (els.length > 0) {
                        //     for (var j = 0; j < getAllChatsWithNewMsg.length; j++) {
                        //         var x = els.length - j - 1;
                        //         console.log(x);
                        //         console.log(getAllChatsWithNewMsg[j].id._serialized);
                        //         let element = els[x];
                        //         element.classList.add(getAllChatsWithNewMsg[j].id._serialized);
                        //     }
                        // }
                        // ------------------ Testing

                        var getAllChatsWithNewMsg = await WAPI.getAllChatsWithNewMsg();

                        var arr = Array.from(document.querySelectorAll('._3m_Xw'))
                        var els = arr.sort(function (a, b) {
                            if (new DOMMatrixReadOnly(getComputedStyle(a).transform).m42 < new DOMMatrixReadOnly(getComputedStyle(b).transform).m42) return 1;
                            if (new DOMMatrixReadOnly(getComputedStyle(a).transform).m42 > new DOMMatrixReadOnly(getComputedStyle(b).transform).m42) return -1;
                            return 0;
                        });

                        console.log("Elements", els);
                        console.log("Elements Length", els.length);
                        console.log("GetAllChatsWithNewMsg Obj", getAllChatsWithNewMsg);
                        if (els.length > 0 && getAllChatsWithNewMsg.length > 0) {
                            for (var j = 0; j < getAllChatsWithNewMsg.length; j++) {
                                var x = els.length - j - 1;
                                var element = els[x];
                                console.log(element);
                                element.classList.add(getAllChatsWithNewMsg[j].id._serialized);
                            }
                        }

                    } catch (error) {
                        console.log(error);
                    }


                    try {

                        // --------------------------------------------------------------------------------------------   window.checkSpam()--------------------------------
                        window.checkSpam(message.body).then((response) => {
                            var res = JSON.parse(response);
                            console.log("Message res after checking ", res);

                            if (res.response === 1) {

                                var msgId = message.id;
                                var from = message.from._serialized;

                                var oldSpamArray = JSON.parse(localStorage.getItem(from))

                                if (oldSpamArray && oldSpamArray.length > 0) {
                                    oldSpamArray = [...oldSpamArray, msgId];
                                } else {
                                    oldSpamArray = [msgId];
                                }

                                localStorage.setItem(from, JSON.stringify(oldSpamArray));




                                // console.log("From \n", from);

                                // adding css on chat head   -----  method 1 
                                // var d = document.getElementsByClassName(from);
                                // console.log("from class", d);
                                // var d1 = d[0].querySelectorAll('.vq6sj')
                                // console.log("from clid class", d1);
                                // d1[0].classList.add("spam-active");

                                // adding css on chat head ------- method 2
                                // get recent message text
                                // _37FrU
                                setTimeout(() => {

                                    var targetedHeadArray = [...document.querySelectorAll("._1qB8f")];
                                    console.log("targetedHeadArray", targetedHeadArray);
                                    // targetedHeadArray[targetedHeadArray.length - 1].classList.add("spam-active");
                                    // targetedHeadArray[targetedHeadArray.length - 1].offsetParent.classList.add("spam-active");
                                    var targetedHead1 = targetedHeadArray.filter((e) => e.innerText == `${message.body}`)
                                    console.log(targetedHead1);
                                    // targetedHead1[0].classList.add("spam-active");
                                    targetedHead1[0].offsetParent.classList.add("spam-active");
                                    

                                    // console.log(message.body);
                                    // var targetedHead = document.querySelector(`[title="${message.body}"]`);
                                    // console.log("Targeted Head", targetedHead);



                                    var maainDiv = document.getElementById('main');
                                    var msgDiv = maainDiv.querySelector("div[data-id='" + msgId + "']")
                                    console.log(msgDiv);
                                    if (msgDiv) {
                                        var inner = msgDiv.querySelector('.Nm1g1');
                                        console.log(inner);
                                        inner.classList.add("spam-active");
                                    }

                                }, 1000);



                            }


                        }).catch((error) => {
                            console.log("Error in checkspam response \n", error);
                            // window.log("Error in sending file\n" + error);
                        });


                    } catch (error) {
                        console.log("catch");
                        console.log(error);
                    }


                }, 2000);
            } catch (error) {
                console.log("catch");
                console.log(error);
            }
        } else {
            // We are sure we haven't found any exact or partial match
            // as we are already checking it in the above if statement
            // So process with the noMatch logic only

            // response = await resolveSpintax(intents.noMatch);
            // console.log(`No exact or partial match found. So replying with ${response} instead`);
            // WAPI.sendMessage2(message.chatId._serialized, response);

        }
    }
}

WAPI.waitNewMessages(false, async (data) => {
    console.log(data)
    // processMessages(data)
    processMessages1(data)
});


WAPI.addSpamCss = function (e) {
    console.log("Add Spam css of event");
    console.log(e);
    var check = e.closest("._3m_Xw");
    var d1 = check.querySelectorAll('.vq6sj')
    console.log(d1);
    // d1[0].style.backgroundColor = "#323739";
    d1[0].classList.remove("spam-active");

}

async function removeSpamMessages() {
    try {
        console.log("RemoveSpamMessages Start");
        document.querySelectorAll('.Nm1g1').forEach((e) => {
            e.classList.remove('spam-active');
        });
    } catch (error) {
        console.log("Error while Removing spam css", error);
    }
}


async function loadSpamMessages() {
    try {
        setTimeout(() => {

            console.log("loadSpamMessages Start");
            // to load spam messages first we have to find out the chat id or number
            var msgList = document.querySelector('#main').querySelectorAll('div[data-id]');
            console.log("msgList", msgList);

            var chatId = msgList[msgList["length"] - 1].dataset.id.split('_')[1]  // return the sender number
            console.log("chatId", chatId);

            var spamList = JSON.parse(localStorage.getItem(chatId));
            console.log("spamList", spamList);

            if (spamList && spamList.length > 0) {
                // console.log("spamList is", spamList );
                spamList.forEach((spamMsgID) => {
                    console.log("spamMsgID", spamMsgID);
                    document.querySelector(`div[data-id="${spamMsgID}"]`)
                        .querySelector('.Nm1g1').classList.add('spam-active');
                })
            }


        }, 1000);


    } catch (error) {
        console.log("error while loading spam msgs", error);
    }
}

WAPI.addNumberClass = async function () {
    console.log("Number class added");
    // try {
    //     //------------------------- working fine right now ------------------
    //     // // var getAllChatsWithNewMsg = await WAPI.getAllChats();
    //     // var getAllChatsWithNewMsg = await WAPI.getAllChatsWithNewMsg();
    //     // console.log(getAllChatsWithNewMsg);
    //     // var els = document.querySelectorAll("._3m_Xw");
    //     // console.log(els);
    //     // // var x = els.length;
    //     // if (els.length > 0) {
    //     //     for (var j = 0; j < getAllChatsWithNewMsg.length; j++) {
    //     //         var x = els.length - j - 1;
    //     //         console.log(x);
    //     //         console.log(getAllChatsWithNewMsg[j].id._serialized);
    //     //         let element = els[x];
    //     //         element.classList.add(getAllChatsWithNewMsg[j].id._serialized);
    //     //         // x--;
    //     //     }
    //     // }

    //     // ------------------------- Testing ------------------

    //     setTimeout(async () => {
    //         var getAllChatsWithNewMsg = await WAPI.getAllChatsWithNewMsg();
    //         console.log(getAllChatsWithNewMsg);
    //         // var els = document.querySelectorAll("._3m_Xw");
    //         // side bar array sorted by their transform(Y) vlaues from top to bottom
    //         var arr = Array.from(document.querySelectorAll('._3m_Xw'))
    //         var els = arr.sort(function (a, b) {
    //             if (new DOMMatrixReadOnly(getComputedStyle(a).transform).m42 > new DOMMatrixReadOnly(getComputedStyle(b).transform).m42) return 1;
    //             if (new DOMMatrixReadOnly(getComputedStyle(a).transform).m42 < new DOMMatrixReadOnly(getComputedStyle(b).transform).m42) return -1;
    //             return 0;
    //         });

    //         if (els.length > 0) {
    //             for (var j = 0; j < getAllChatsWithNewMsg.length; j++) {
    //                 let element = els[j];
    //                 console.log(element);
    //                 element.classList.add(getAllChatsWithNewMsg[j].id._serialized);
    //             }
    //         }
    //     }, 1000);


    // } catch (error) {
    //     console.log(error);
    // }

    // var checkbox = document.getElementById('ActiveSpamFilter');
    // console.log("checkbox", checkbox);

    // await loadSpamMessages();

}



WAPI.settingUpReloadFunction = function () {
    alert("function call");
    window.onload = function () {
        Custom.init();
        alert("inject reload function call");
        window.callReloadFunction().then((response) => {
            alert(response);
        });
    };
}


WAPI.addOptions = function () {
    var suggestions = "";
    intents.smartreply.suggestions.map((item) => {
        suggestions += `<button style="background-color: #dcf8c6;
                                margin: 5px;
                                padding: 5px 10px;
                                font-size: inherit;
                                border-radius: 50px;" class="reply-options">${item}</button>`;
    });
    var div = document.createElement("DIV");
    div.style.height = "40px";
    div.style.textAlign = "center";
    div.style.zIndex = "5";
    div.innerHTML = suggestions;
    div.classList.add("grGJn");
    var mainDiv = document.querySelector("#main");
    var footer = document.querySelector("footer");
    footer.insertBefore(div, footer.firstChild);
    var suggestions = document.body.querySelectorAll(".reply-options");
    for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i];
        suggestion.addEventListener("click", (event) => {
            console.log(event.target.textContent);
            window.sendMessage(event.target.textContent).then(text => console.log(text));
        });
    }
    mainDiv.children[mainDiv.children.length - 5].querySelector("div > div div[tabindex]").scrollTop += 100;
}


WAPI.setupFeaturePage = async function () {
    // alert("Setup the WBOT button on the header");

    var checkbtn = JSON.parse(localStorage.getItem('checkbtn'));

    if (!checkbtn || checkbtn == false) {
        await removeSpamMessages();
    } else {
        await loadSpamMessages();
    }

    // Setup the WBOT button on the header
    var header = document.querySelector("header");
    var featureButton = document.querySelector("#featureButton");
    var presentButton = document.contains(featureButton);

    if (presentButton != true) {
        var newFeatureButton = document.createElement("div");
        newFeatureButton.innerHTML = `
            <button id="featureButton" onClick="openPopup()">WBOT</button>
        `;
        header.append(newFeatureButton);
    }

    // Setup the feature page on the right side of the window (i.e chat window)
    var newPopup = document.createElement("div");
    newPopup.innerHTML = `
    <style>
    .spam-active{
        background-color: #8c880c!important;
    }
    ul{
        padding: 20px 0px;
        
    }
    ul li{
        padding: 0px 10px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        flex: 1;
    }
    ul li label{
        width: -webkit-fill-available;
    }
    </style>
    <ul>
        
        <li>
            <label style="font-size: 20px">Active Spam Filter</label>
            <input id = "ActiveSpamFilter" onclick = "handleFeature(this);" type="checkbox" ${(checkbtn == true) ? 'checked="checked"' : ''} >
        </li>
        </ul>
        <button style="background-color: #4CAF50;
                    border: none;
                    color: white;
                    padding: 15px;
                    text-align: center;
                    text-decoration: none;
                    display: inline-block;
                    font-size: 16px;
                    margin: 4px 2px;
                    cursor: pointer;"
        id="closePopup" onClick = "closePopup();"> Close </button>        
    `;
    newPopup.setAttribute("id", "featurePopup");
    newPopup.style.backgroundColor = "rgb(255, 255, 255)";
    newPopup.style.display = "none";
    newPopup.style.textAlign = "center";
    newPopup.style.zIndex = "999999999";
    newPopup.style.padding = "10px";
    newPopup.style.color = "black";
    newPopup.style.borderRadius = "30px";
    newPopup.style.position = "absolute";
    newPopup.style.overflow = "hidden auto";
    var webpage = document.querySelector("#main");
    webpage.append(newPopup);

    var blurNamestyle = document.querySelector("#blur-names");
    var blurPhotostyle = document.querySelector("#blur-photos");
    var blurChatstyle = document.querySelector("#blur-chats");
    var blurRecentMessagesstyle = document.querySelector("#blur-recent-messages");
    var ActiveSpamFilterstyle = document.querySelector("#Active-Spam-Filter");
    var darkModestyle = document.querySelector(".dark");

    // setValues(blurNamestyle, "#blurName");
    // setValues(blurPhotostyle, "#blurPhoto");
    // setValues(blurChatstyle, "#blurChat");
    // setValues(blurRecentMessagesstyle, "#blurRecentMessages");
    // setValues(darkModestyle, "#darkMode");
    setValues(ActiveSpamFilterstyle, "#ActiveSpamFilter");
}

setValues = function (styleName, checkboxId) {
    var style = document.querySelector(checkboxId);
    if (styleName != null) {
        style.checked = true;
    }
}

openPopup = function () {
    var popup = document.querySelector("#featurePopup");
    popup.style.display = "block";
}

closePopup = function () {
    var popup = document.querySelector("#featurePopup");
    popup.style.display = "none";
}

function handleFeature(btn) {
    var btnId = btn.id;

    if (btnId == "blurName") {
        blurName(btn);
    }

    if (btnId == "blurPhoto") {
        blurPhoto(btn);
    }

    if (btnId == "blurChat") {
        blurChat(btn);
    }

    if (btnId == "blurRecentMessages") {
        blurRecentMessages(btn);
    }

    if (btnId == "darkMode") {
        darkMode(btn);
    }
    if (btnId == "ActiveSpamFilter") {
        ActiveSpamFilter(btn);
    }
}

async function ActiveSpamFilter(btn) {
    var status = btn.checked;
    if (status == true) {
        localStorage.setItem('checkbtn', true);
        await loadSpamMessages();
        // // If old style is present then first remove the old style
        // var style = document.querySelector("#Active-Spam-Filter");
        // if (style != null) {
        //     style.remove();
        // }
        // // Injecting style in head
        // var head = document.getElementsByTagName('head')[0];
        // var style = document.createElement("style");
        // style.setAttribute("id", "Active-Spam-Filter");
        // style.innerHTML = `
        //     ._8hzr9 { filter: blur(4px); } ._8hzr9:hover { filter: blur(0); }
        // `;
        // head.append(style);
    } else {
        localStorage.setItem('checkbtn', false);
        await removeSpamMessages();
        // var style = document.querySelector("#Active-Spam-Filter");
        // style.remove();
    }
}

function blurName(btn) {
    var status = btn.checked;
    if (status == true) {
        // If old style is present then first remove the old style
        var style = document.querySelector("#blur-names");
        console.log(style);
        if (style != null) {
            style.remove();
        }

        // Injecting style in head
        var head = document.getElementsByTagName('head')[0];
        var style = document.createElement("style");
        style.setAttribute("id", "blur-names");
        style.innerHTML = `
        ._3q9s6, ._21nHd, ._3WYXy, .hooVq, .zoWT4, ._2YPr_, .czcZD, ._ccCW { filter: blur(4px) !important; } ._3q9s6:hover, ._21nHd:hover, ._3WYXy:hover, .hooVq:hover, .zoWT4:hover, ._2YPr_:hover, .czcZD:hover, ._ccCW:hover { filter: blur(0) !important; }
        `;
        head.append(style);
    } else {
        var style = document.querySelector("#blur-names");
        style.remove();
    }
}


function blurPhoto(btn) {
    var status = btn.checked;
    if (status == true) {
        // If old style is present then first remove the old style
        var style = document.querySelector("#blur-photos");
        if (style != null) {
            style.remove();
        }

        // Injecting style in head
        var head = document.getElementsByTagName('head')[0];
        var style = document.createElement("style");
        style.setAttribute("id", "blur-photos");
        style.innerHTML = `
            ._8hzr9 { filter: blur(4px); } ._8hzr9:hover { filter: blur(0); }
        `;
        head.append(style);
    } else {
        var style = document.querySelector("#blur-photos");
        style.remove();
    }
}

function blurRecentMessages(btn) {
    var status = btn.checked;
    if (status == true) {
        // If old style is present then first remove the old style
        var style = document.querySelector("#blur-recent-messages");
        console.log(style);
        if (style != null) {
            style.remove();
        }

        // Injecting style in head
        var head = document.getElementsByTagName('head')[0];
        var style = document.createElement("style");
        style.setAttribute("id", "blur-recent-messages");
        style.innerHTML = `
            .Hy9nV { filter: blur(4px); } .Hy9nV:hover { filter: blur(0); }
        `;
        head.append(style);
    } else {
        var style = document.querySelector("#blur-recent-messages");
        style.remove();
    }
}

function blurChat(btn) {
    var status = btn.checked;
    if (status == true) {
        // If old style is present then first remove the old style
        var style = document.querySelector("#blur-chats");
        console.log(style);
        if (style != null) {
            style.remove();
        }

        var head = document.getElementsByTagName('head')[0];
        var style = document.createElement("style");
        style.setAttribute("id", "blur-chats");
        style.innerHTML = `
        .message-out, .message-in { filter: blur(4px); } .message-out:hover, .message-in:hover { filter: blur(0); }
        `;
        head.append(style);
    } else {
        var style = document.querySelector("#blur-chats");
        style.remove();
    }
}

function darkMode(btn) {
    var webpage = document.querySelector("body");
    var featureButton = document.querySelector("#featureButton");
    var status = btn.checked;
    var suggestions = document.querySelector(".reply-options");
    console.log(suggestions);

    // if (status == true) {
    //     webpage.classList.add("dark");
    //     featureButton.style.color = "white";
    //     for (x of suggestions) {
    //         x.style.backgroundColor = '#056162';
    //     }
    // } else {
    //     webpage.classList.remove("dark");
    //     featureButton.style.color = "black";
    //     for (x of suggestions) {
    //         x.style.backgroundColor = '#dcf8c6';
    //     }
    // }
}