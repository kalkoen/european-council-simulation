var countryData = {};
var chart;
var table = {};
var tableBody;
var tableHeaders = [];

var population;
var gdp;
var migration;

var inputRefugees;
var inputMigration;

var migrationLookback = 3;
var proposedMaxMultiplier = 1.1;
var newProposedMaxRange = 0.4;

$(document).ready(function () {
    createGraph();
    tableBody = $("#tableBody");

    $.ajax({
        type: "GET",
        url: "countrydata.csv",
        dataType: "text",
        success: function (data) {
            processCountryData(data);
            calculateNetImmigration(migrationLookback);
            fillTable();
            updateGraph();
        }
    });


    population = {
        slider: document.getElementById("populationSlider"),
        label: document.getElementById("populationLabel")
    };
    updateSlider(population, Number(population.slider.value));
    population.slider.addEventListener("input", (ev) => {
        compensateSliders(population, ev, gdp, migration);
    });

    gdp = {
        slider: document.getElementById("gdpSlider"),
        label: document.getElementById("gdpLabel")
    };
    updateSlider(gdp, Number(gdp.slider.value));
    gdp.slider.addEventListener("input", (ev) => {
        compensateSliders(gdp, ev, population, migration, true);
    });

    //    gdp.slider.addEventListener("slide change", function (event) {
    //        gdp.slider.value = 70;
    //        event.preventDefault();
    //        event.stopPropagation();
    //        event.stopImmediatePropagation();
    //    });

    migration = {
        slider: document.getElementById("migrationSlider"),
        label: document.getElementById("migrationLabel")
    };
    updateSlider(migration, Number(migration.slider.value));
    migration.slider.addEventListener("input", (ev) => {
        compensateSliders(migration, ev, population, gdp);
    });

    inputRefugees = document.getElementById("expectedRefugees");
    inputMigration = document.getElementById("migrationLookback");

    $("#refreshButton").on("click", function (ev) {
        if (parseInt(inputMigration.value) != migrationLookback) {
            migrationLookback = inputMigration.value;
            calculateNetImmigration(migrationLookback);
        }
        calculateProposedApplications();
        
        fillTable();
        updateGraph();
        
    });
});

function compensateSliders(percentage1, event, percentage2, percentage3, fixSecondPercentage) {
    value = Number(event.target.value);


    var availableRemainder = 100 - value;
    // Total share of sliders not being input
    var totalRemainder = percentage2.value + percentage3.value;


    if (fixSecondPercentage) {
        // Changing the gdp slider and locking the first
        var value2 = percentage2.value;
    } else if (totalRemainder == 0) {
        // Both other sliders at 0 means 2 and 3 will go equally
        value2 = availableRemainder / 2;
    } else {
        // Scale in ratio
        value2 = percentage2.value / totalRemainder * availableRemainder;
    }


    // Complete 100
    var value3 = availableRemainder - value2;


    event.target.value = value;
    updateSlider(percentage1, value);
    updateSlider(percentage2, value2);
    updateSlider(percentage3, value3);

    if (gdp.value > 100 - population.value) {
        value = 100 - population.value;
        updateSlider(gdp, value);
        updateSlider(migration, 0);
    }


}

function updateSlider(percentage, value) {
    percentage.value = value;
    percentage.slider.value = value.toFixed(1);
    percentage.label.innerHTML = value.toFixed(1) + "%";
}



function calculateProposedApplications() {

    var nCountries = countryData.countryName.length;
    
    var i;
    for (i = 0; i < nCountries; i++) {
        // Reset
        countryData.proposedApplications[i] = 0
    }
    
    var expectedNrRefugees = inputRefugees.value;
    
    
    
    
    // Population
    var totalPopulation = countryData["populationReal"].reduce((a, b) => a + b, 0)

    var populationPart = expectedNrRefugees * population.value / 100;

    var i;
    for (i = 0; i < nCountries; i++) {
        // Reset
        countryData.proposedApplications[i] += populationPart * countryData["populationReal"][i] / totalPopulation
    }
    
    
    
    // Gdp
    var totalGdp = countryData["gdpReal"].reduce((a, b) => a + b, 0)

    var gdpPart = expectedNrRefugees * gdp.value / 100;

    var i;
    for (i = 0; i < nCountries; i++) {
        // Reset
        countryData.proposedApplications[i] += gdpPart * countryData["gdpReal"][i] / totalGdp
    }
    
    
    
    // PreviousAsylum

    var Inew = expectedNrRefugees * migration.value / 100;

    var minPrevious = Math.min.apply(null, countryData.averageNetMigration);
    // Calculate compensations in comparison to country with least intake
    var i;
    for (i = 0; i < nCountries; i++) {
        // Assuming negative net migration doesn't imply sending refugees away
        countryData.c[i] = (Math.max(0, countryData.averageNetMigration[i]) - minPrevious)
    }

    // Normalize compensation so that Asl is never higher than the amount of new refugees (or else countries get negative proposed applications)
    var maxC = Math.max.apply(null, countryData.c);
    
    var normalShare = Inew/nCountries;
    if (maxC > normalShare) {
        var i;
        for (i = 0; i < nCountries; i++) {
            countryData.c[i] = countryData.c[i] / maxC * normalShare;
            var c = countryData.c[i];
            c = c * 1;
        }
    }

    var sumC = countryData.c.reduce((a, b) => a + b, 0);
    Asl = (Inew + sumC) / nCountries;

    var i;
    for (i = 0; i < nCountries; i++) {
        countryData.proposedApplications[i] += Math.round(Asl - countryData.c[i]);
    }

    var i;
    for (i = 0; i < nCountries; i++) {
        // Reset
        countryData.proposedApplications[i] = Math.round(countryData.proposedApplications[i]);
    }
    
    console.log(countryData.proposedApplications.reduce((a, b) => a + b, 0))
    
    
    var newMax = Math.max.apply(null, countryData.proposedApplications) * proposedMaxMultiplier;
    var currentProposedMax = chart.options.scales.yAxes[0].ticks.suggestedMax;
    if(typeof(currentProposedMax) == "undefined" || newMax > currentProposedMax || newMax*proposedMaxMultiplier/currentProposedMax <= newProposedMaxRange) {
        chart.options.scales.yAxes[0].ticks.suggestedMax = newMax*proposedMaxMultiplier;
    }
}



function processCountryData(source) {
    countryData.netMigration = [];
    countryData.averageNetMigration = [];
    countryData.proposedApplications = [];
    countryData.c = [];

    var separator = ",";
    var lines = source.split(/\r\n|\n/);
    if (lines.length == 0) {
        return;
    }
    var headings = lines.shift().split(separator);
    headings.forEach(function (heading) {
        countryData[heading] = [];
    });
    var i;
    for (i = 0; i < lines.length - 1; i++) {
        countryData.netMigration[i] = 0;
        countryData.proposedApplications[i] = 0;

        var row = lines[i];
        var cells = row.split(separator);
        var j;
        for (j = 0; j < cells.length; j++) {
            var data = Number(cells[j]);
            countryData[headings[j]][i] = isNaN(data) ? cells[j] : data;
        }
    }

}

function calculateNetImmigration(years) {
    var endYear = 2016;
    var startYear = endYear - years;

    var i;
    for (i = 0; i < countryData.countryName.length; i++) {
        countryData.netMigration[i] = countryData[endYear.toString()][i] - countryData[startYear.toString()][i];
        countryData.averageNetMigration[i] = Math.round(countryData.netMigration[i] / years);
    }



    $(".migrationLookbackHeader").each(function () {
        $(this).text(years);
    });
}

function emptyTable() {
    tableBody = $("#tableBody");
    tableBody.empty();
}

function fillTable() {
    emptyTable();

    // jQuery is making me unhappy...
    var headers = document.getElementsByTagName("th");
    var i;
    for (i = 0; i < headers.length; i++) {
        table[headers[i].getAttribute("dataHeader")] = [];
    }

    tableBody = $("#tableBody")
    var i;
    for (i = 0; i < countryData.countryName.length; i++) {
        var tableRow = $("<tr></tr>");
        var header;
        for (header in table) {
            var cell = $("<td></td>");
            tableRow.append(cell);
            table[header][i] = cell;
        }
        tableBody.append(tableRow);
    }
    updateTable();
}

function updateTable() {
    var header;
    for (header in table) {
        var col = table[header];
        var dataCol = countryData[header];
        var i;
        for (i = 0; i < col.length; i++) {
            col[i].attr("align", "right");
            if (header == "countryName") {
                col[i].attr("align", "left");
            }

            if (header === "flag") {
                col[i].html("<span class='flag-icon flag-icon-" + dataCol[i].toLowerCase() + "'></span>");
                col[i].attr("class", "center-text");

            } else {
                col[i].text(dataCol[i].toLocaleString());
            }
        }
    }

}

function updateGraph() {
    chart.data.labels = countryData.countryName;
    chart.data.datasets.forEach((dataset) => {
        dataset.data = countryData[dataset.dataHeader];
    });


    
    chart.update();
}

function createGraph() {
    Chart.defaults.global.animation.duration = 2000;
    var ctx = document.getElementById("bar-chart").getContext('2d');
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
//                yAxisID: "y-axis-pop",
                label: 'Population',
                dataHeader: 'populationReal',
                hidden: true,
                fillColor: "rgba(220,220,220,0.5)",
                data: []
            }, {
//                yAxisID: "y-axis-migration",
                label: 'Average net migration',
                dataHeader: 'averageNetMigration', 
                hidden: true,
                data: []
            }, {
//                yAxisID: "y-axis-gdp",
                label: 'GDP (millions USD)',
                dataHeader: 'gdpReal',
                hidden: "true",
                data: []
            }, {
//                yAxisID: "y-axis-pa",
                label: 'Proposed yearly applications',
                dataHeader: 'proposedApplications',
                fillColor: "yellow", 
                data: []
            }]
        },
        options: {
            responsiveAnimationDuration: 2000,
            maintainAspectRatio: false,
            scales: {
                xAxes: [{
                    ticks: {
                        autoSkip: false
                    }
                }],
                yAxes: [
//                    {
//                    id: "y-axis-pa",
//                    ticks: {
//                        beginAtZero: true
//                    }
//                }, 
//                        {
//                    id: "y-axis-migration",
//                    ticks: {
//                        beginAtZero: true
//                    }
//                }, 
//                        
//                        {
//                    id: "y-axis-gdp",
//                    ticks: {
//                        beginAtZero: true
//                    }
//                },
                {
//                    id: "y-axis-takein",
                    ticks: {
                        beginAtZero: true
                    }
                }]
            }
        }
    });
}