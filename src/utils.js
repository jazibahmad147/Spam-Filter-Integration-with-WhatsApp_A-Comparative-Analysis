var path = require("path");
const mime = require('mime');
var fs = require("fs");
const axios = require('axios');


this.injection = function (filename) {
    return new Promise((resolve, reject) => {
        var filepath = path.join(__dirname, filename);
        //console.log("reading file from" + (filepath));
        fs.readFile(filepath, 'utf8', (err, data) => {
            if (err) return reject(err);
            console.log("1 " + data);
            resolve(data);
        });
    });
}

this.externalInjection = function (filename) {
    return new Promise((resolve, reject) => {
        //console.log("reading file from" + process.cwd());
        var filepath = path.join(process.cwd(), filename);
        fs.readFile(filepath, 'utf8', (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}

this.getFileInBase64 = function (filename) {
    return new Promise((resolve, reject) => {
        try {
            filename = path.join(process.cwd(), filename);
            // get the mimetype
            const fileMime = mime.getType(filename);
            var file = fs.readFileSync(filename, { encoding: 'base64' });
            resolve(`data:${fileMime};base64,${file}`);
        } catch (error) {
            reject(error);
        }
    });
}

const getMessageStatus = async (Msg) => {
    try {
        let domain = "https://is-spam-or-not-api.herokuapp.com/?input_sms=";
        let obj = domain+Msg;
        return await axios.get(obj);
        // return await axios.get(`https://jsonplaceholder.typicode.com/users`)
        // return await axios.get(`https://is-spam-or-not-api.herokuapp.com/?input_sms=you%20win%20this%20lotery%20click%20the%20button%20below`)
    } catch (error) {
        console.error(error)
    }
}

this.checkSpam = async function (Msg) {
    console.log("CheckSpam Function Called, the message is \n" , Msg);
    const messageObj = await getMessageStatus(Msg)
    if (messageObj.data.message) {
        return JSON.stringify(messageObj.data);
    }
}

// this.callReloadFunction = async function () {
//     console.log("Reload function is call");
//     return true;
// }


this.delay = ms => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};

this.saveFileFromBase64 = (base64Data, name, type) => {
    console.log("save file called")
    let extension = mime.getExtension(type)
    try {
        fs.writeFileSync(path.join(process.cwd(), name + "." + extension), base64Data, 'base64')
    } catch (error) {
        console.error("Unable to write downloaded file to disk")
    }
}