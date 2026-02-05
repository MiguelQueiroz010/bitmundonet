var xmlDoc = null;
var toolArray = [];
var currentView = 'name'; // default

function readXml(xmlFile) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            xmlDoc = this.responseXML;
            parseTools(xmlDoc);
            renderTools();
        }
    };
    xmlhttp.open("GET", xmlFile, true);
    xmlhttp.send();
}

function parseTools(xmlDoc) {
    var tools = xmlDoc.getElementsByTagName("tool");
    toolArray = [];

    for (var i = 0; i < tools.length; i++) {
        var tool = tools[i];
        var toolExtra = "";
        if (tool.getElementsByTagName("extra").length > 0) {
            toolExtra = tool.getElementsByTagName("extra")[0].childNodes[0].nodeValue;
        }

        toolArray.push({
            name: tool.getAttribute("nome"),
            link: tool.getElementsByTagName("url")[0].childNodes[0].nodeValue,
            description: tool.getElementsByTagName("description")[0].childNodes[0].nodeValue,
            image: tool.getElementsByTagName("icon")[0].childNodes[0].nodeValue,
            version: tool.getElementsByTagName("version")[0].childNodes[0].nodeValue,
            type: tool.getElementsByTagName("type")[0].childNodes[0].nodeValue,
            target: tool.getElementsByTagName("target")[0].childNodes[0].nodeValue,
            credits: tool.getElementsByTagName("credit")[0].childNodes[0].nodeValue,
            extraLink: toolExtra
        });
    }
}

function renderTools() {
    var toolList = document.getElementById("alphabet-list");
    toolList.innerHTML = ""; // Clear current list

    // Sort the main array by name always for internal consistency or initial view
    toolArray.sort((a, b) => a.name.localeCompare(b.name));

    var groups = {};

    if (currentView === 'name') {
        // Group by first letter
        toolArray.forEach(tool => {
            var letter = tool.name.charAt(0).toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(tool);
        });
    } else if (currentView === 'target') {
        // Group by Category (Target)
        toolArray.forEach(tool => {
            var cat = tool.target || "Geral";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(tool);
        });
    } else if (currentView === 'type') {
        // Group by Type
        toolArray.forEach(tool => {
            var type = tool.type || "Outros";
            if (!groups[type]) groups[type] = [];
            groups[type].push(tool);
        });
    }

    // Sort Group Keys
    var sortedKeys = Object.keys(groups).sort();

    sortedKeys.forEach(key => {
        // Create Section Header
        var section = document.createElement("li");
        section.innerHTML = `<h3>${key}</h3>`;
        toolList.appendChild(section);

        // Create tools in this section
        groups[key].forEach(tool => {
            var toolItem = document.createElement("div");
            toolItem.className = "toolItem";
            toolItem.innerHTML = `
                <a style="cursor: pointer;" onclick="toggleFolder(this)">
                    <picture class="hide_folder_wrapper">
                        <img class="folder-arrow" src="../../elements/light_down_arrow.png" style="width: 20px; height: 20px; transition: transform 0.3s; filter: brightness(0) invert(1);" />
                    </picture>
                    <img src="${tool.image}" style="width: 48px; height: 48px; object-fit: contain;" />
                    <h2>${tool.name}</h2>
                </a>
                <div class="info-panel" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);">
                    <p>${tool.description} <a target="_blank" href="${tool.extraLink}">${tool.extraLink}</a>
                        <br><br>
                        <strong>Tipo:</strong> ${tool.type}
                        <br><br>
                        <strong>Alvo:</strong> <span style="color:var(--highlight)">${tool.target}</span>
                        <br><br>
                        <strong>Créditos:</strong> <span style="color:#4ade80">${tool.credits}</span>
                    </p>
                    <div id="link" style="margin-top: 1.5rem;">
                        <a href="${tool.link}" target="_blank" style="display: inline-flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                            <img src="/media/download.png" style="width: 48px; height: 48px;">
                            <span style="font-size: 0.9rem;">Download (${tool.version})</span>
                        </a>
                    </div>
                </div>
            `;
            section.appendChild(toolItem);
        });
    });
}

function toggleFolder(el) {
    var info = el.nextElementSibling;
    var arrow = el.querySelector('.folder-arrow');

    if (info.style.display === "none") {
        info.style.display = "block";
        if (arrow) arrow.style.transform = "scaleY(-1)";
    } else {
        info.style.display = "none";
        if (arrow) arrow.style.transform = "scaleY(1)";
    }
}

function switchView(mode) {
    currentView = mode;

    // Update active button state
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(mode)) {
            btn.classList.add('active');
        }
    });

    renderTools();
}