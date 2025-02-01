var xmlDoc = null;

function readXml(xmlFile) {
    if (typeof window.DOMParser != "undefined") {
        xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", xmlFile, false);
        if (xmlhttp.overrideMimeType) {
            xmlhttp.overrideMimeType('text/xml');
        }
        xmlhttp.send();
        xmlDoc = xmlhttp.responseXML;
    }
    else {
        xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = "false";
        xmlDoc.load(xmlFile);
    }

    getTools(xmlDoc);
}
function getTools(xmlDoc) {
    var tools = xmlDoc.getElementsByTagName("tool");
    var toolList = document.getElementById("alphabet-list");
    var toolArray = [];

    for (var i = 0; i < tools.length; i++) {
        var tool = tools[i];
        var toolName = tool.getAttribute("nome");
        var toolLink = tool.getElementsByTagName("url")[0].childNodes[0].nodeValue;
        var toolDescription = tool.getElementsByTagName("description")[0].childNodes[0].nodeValue;
        var toolImage = tool.getElementsByTagName("icon")[0].childNodes[0].nodeValue;
        var toolVersion = tool.getElementsByTagName("version")[0].childNodes[0].nodeValue;
        var toolType = tool.getElementsByTagName("type")[0].childNodes[0].nodeValue;

        toolArray.push({
            name: toolName,
            link: toolLink,
            description: toolDescription,
            image: toolImage,
            version: toolVersion,
            type: toolType
        });
    }

    toolArray.sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    for (var i = 0; i < toolArray.length; i++) {
        var toolItem = document.createElement("div");
        toolItem.className = "toolItem";
        toolItem.innerHTML = `<a href="#info" onclick="folder(this)">
            <picture id="hide_folder" >
            <source srcset="../../elements/down_arrow.png" media="(prefers-color-scheme: dark)" />
            <img id="hide_folder" src="../../elements/light_down_arrow.png" />
            </picture>
            <img src="${toolArray[i].image}" />
            <h2>${toolArray[i].name}</h2>
            </a>
             <div id="info" style="display: none;">
            <p>${toolArray[i].description}
            <br><br>
            Tipo de Ferramenta: ${toolArray[i].type}
            </p>
            <div id="link">
            <a href="${toolArray[i].link}" target="_blank">
            
            <p><img src="/media/download.png"></img>
            <br>Versão (${toolArray[i].version})</p></a>
            </div>
            <br>
             </div>
            
        `;
        toolList.appendChild(toolItem);
        var firstLetter = toolArray[i].name.charAt(0).toUpperCase();
        var letterSection = document.getElementById(firstLetter);
        if (!letterSection) {
            letterSection = document.createElement("li");
            letterSection.id = firstLetter;
            letterSection.innerHTML = "<h3>" + firstLetter + "</h3>";
            toolList.appendChild(letterSection);
        }
        letterSection.appendChild(toolItem);
    }

}
function folder(el) {
    var info = el.nextElementSibling;
    console.log(el);
    if (info.style.display === "none") {
        info.style.display = "block";
        el.children[0].children[1].style.transform = "scaleY(-1)";
    } else {
        info.style.display = "none";
        el.children[0].children[1].style.transform = "scaleY(+1)";
    }
}