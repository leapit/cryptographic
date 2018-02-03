(function(d3){

    // Canvas size
    let width = 1200, height = 900;

    // Mid-point of the canvas
    let midX = width / 2, midY = height / 2;

    // Currency bubble sizes
    let minBubble = 15, maxBubble = 50;
    let minFont = 10, maxFont = 20;

    // Year ring radius
    let minRing = maxBubble*2, maxRing = (Math.min(width, height) / 2) - maxBubble;

    // Fixed rotation offset to give some clearance to the labels
    let yearClearance = Math.PI / 16, rotationOffset = yearClearance / 2;

    // How is text positioned in the vertical axis
    // given the number of lines in the currency bubble
    let textLayoutMap = {
        1: [ 0.5 ],
        2: [ 0.35, 0.6 ],
        3: [ 0.3, 0.55, 0.75 ]
    };

    // Insert the SVG element
    let svg = d3.select('#graphic')
                .append('svg')
                .attr('width', width)
                .attr('height', height);

    function parseNumber(x) {
        return Number(x.trim().replace(/,/g, ''));
    }

    function sortCurrencies(a, b)
    {
        if(a.year === b.year) return 0;
        return (a.year < b.year) ? -1 : 1;
    }

    function enrichData(data)
    {
        // Sort currencies by age
        data.sort(sortCurrencies);
        
        // Maximum Total Market Cap and 30 Day Volume
        let maxCap = d3.max(data, x => x.cap);
        let maxVol = d3.max(data, x => x.vol);

        // Calculate the percentage of the total cap, and total volume
        data.forEach(x => {
            x.capScore = (x.cap / maxCap);
            x.volScore = (x.vol / maxVol);
            // Calculate "overall" as a 2:1 ratio of cap:vol
            x.overall = (2 * x.capScore) + x.volScore;            
        });

        // Re-map using a log scale
        let overallScale = d3.scaleLog()
            .base(1.1)
            .domain([d3.min(data, x => x.overall), d3.max(data, x => x.overall)])
            .range([0, 1]);

        let scoreScale = d3.scaleLog()
            .base(1.1)
            .clamp(true)
            .domain([0.01, 1])
            .range([0, 1]);

        data.forEach(x => {
            x.capScore = scoreScale(x.capScore);
            x.volScore = scoreScale(x.volScore);
            x.overall = overallScale(x.overall);
        });
    }

    let btc = null;
    let yearScale = null;
    let bubbleScale = null;
    let textScale = null;

    function drawGraphic(data)
    {
        // Single out bitcoin, because it's in the center and treated slightly different
        btc = data.find(x => x.code === 'BTC');

        // Group the currencies by category
        let byCategory = data.reduce((memo, val) => { 
            if(val.code === btc.code) return memo;
            memo[val.category] = memo[val.category] || [];
            memo[val.category].push(val);
            return memo;
        }, {});

        // Divide the total circle based on the number of currencies in each category
        // Giving a little bit of extra room for the year legend
        // and ignoring BTC because it isn't in a category
        let perBubble = ((2 * Math.PI) - yearClearance) / (data.length - 1);
        let angle = rotationOffset;

        // Build the arcs for each category
        for(let c in byCategory) {
            let cat = byCategory[c];
            cat.category = c;
            cat.startAngle = angle;
            cat.endAngle = angle + (perBubble * cat.length);
            drawCategoryArc(cat);
            angle = cat.endAngle;
        }

        // How many distinct years are there?
        let years = [...new Set(data.filter(x => x.code !== btc.code).map(x => x.year))];
        years.sort();

        // Map the year to a ring radius
        yearScale = d3.scaleLinear()
            .domain([years[0], years[years.length - 1]])
            .range([minRing, maxRing]);

        // Draw the year rings and legend
        drawYears(years);

        // Map the overall score to a bubble size
        bubbleScale = d3.scaleLinear()
            .domain([0, 1])
            .range([minBubble, maxBubble]);

        // Map the overall score to text size
        textScale = d3.scaleLinear()
            .domain([0, 1])
            .range([minFont, maxFont]);

        // Draw the Bitcoin Bubble (ha!)
        drawBubble(btc, 0);
        
        // Draw the bubbles within each category
        for(let c in byCategory) {
            drawCategoryBubbles(byCategory[c]);            
        }
    }

    function drawCategoryArc(cat)
    {
        let catArc = d3.arc()
            .innerRadius(0)
            .outerRadius(maxRing + 2*maxBubble)
            .startAngle((Math.PI / 2) - cat.startAngle)
            .endAngle((Math.PI / 2) - cat.endAngle);

        let catArcPath = svg.append('path')
            .attr('d', catArc())
            .attr('transform', `translate(${midX} ${midY})`)
            .attr('class', `category category-${cat.category}`);
    }

    function drawYears(years)
    {
        // Draw the year rings
        years.forEach(y => {
            svg.append('circle')
               .attr('cx', midX)
               .attr('cy', midY)
               .attr('r', yearScale(y))
               .attr('class', 'year-ring');
        });
        
        // Disrupt the rings briefly so the year labels are easier to read
        svg.append('rect')
           .attr('width', midX)
           .attr('height', minBubble * 2)
           .attr('x', midX)
           .attr('y', midY - minBubble)
           .attr('class', 'year-clearance');

        // Draw the year labels
        let lastX = 0;
        years.forEach(y => {
            lastX = midX + yearScale(y);
            svg.append('text')
               .attr('x', lastX)
               .attr('y', midY)
               .text(y)
               .attr('class', 'year-label');
        });

        svg.append('text')
            .attr('x', lastX + 50)
            .attr('y', midY)
            .text('Inception')
            .attr('class', 'year-caption');
    }

    function drawCategoryBubbles(cat)
    {
        // How much space do we have for this category?
        let sweep = cat.endAngle - cat.startAngle;
        let minAngle = cat.startAngle + sweep * 0.1;
        let maxAngle = cat.endAngle - sweep * 0.1;
        sweep = sweep * 0.8;

        let perBubble = sweep / cat.length;

        let i = 0;

        cat.forEach(currency => {
            let angle = minAngle + (i * perBubble) + 0.5*perBubble;
            drawBubble(currency, -angle);
            i++;
        });
    }

    function drawBubble(currency, angle)
    {
        let yearRadius = yearScale(currency.year);
        
        // Calculate the position of the bubble
        let bubbleX = midX + (yearRadius * Math.cos(angle)),
            bubbleY = midY + (yearRadius * Math.sin(angle));

        // BTC always in the centre...
        if(currency.code === btc.code) {
            bubbleX = midX;
            bubbleY = midY;
        }

        // Calculate the radius of the bubble based on the overall score
        let bubbleRadius = bubbleScale(currency.overall);

        // Draw the white background of the bubble
        let background = svg.append('circle')
            .attr('cx', bubbleX)
            .attr('cy', bubbleY)
            .attr('r', bubbleRadius)
            .attr('class', 'c-background');

        // Draw the Market Cap and Trading Volume Arcs
        drawScoreArc(bubbleX, bubbleY, bubbleRadius, currency.capScore, 'right', 'c-cap-arc');
        drawScoreArc(bubbleX, bubbleY, bubbleRadius, currency.volScore, 'left', 'c-vol-arc');

        // Draw the outline of the bubble
        let outline = svg.append('circle')
            .attr('cx', bubbleX)
            .attr('cy', bubbleY)
            .attr('r', bubbleRadius)
            .attr('class', 'c-outline');
        
        // Calculate the font size based on the overall score
        let fontSize = textScale(currency.overall);

        // A scale for laying out lines of text vertically through the bubble
        // 0: Top of the bubble; 1: Bottom of the bubble.
        let textLayout = d3.scaleLinear()
            .domain([0, 1])
            .range([bubbleY - bubbleRadius, bubbleY + bubbleRadius]);

        // Work out how many lines of text to draw
        let nameParts = currency.name.split(' ');
        let noName = (currency.code === currency.name.toUpperCase() || bubbleRadius < 18);
        let lineCount = noName ? 1 : nameParts.length + 1;
        let lineLayout = (i) => textLayout(textLayoutMap[lineCount][i]);

        // Draw the currency code
        let code = svg.append('text')
            .text(currency.code)
            .attr('x', bubbleX)
            .attr('y', lineLayout(0))
            .style('font-size', fontSize)
            .attr('class', 'c-code');
        
        if(!noName) {
            // Draw the first line of the name
            let name1 = svg.append('text')
                .text(nameParts[0])
                .attr('x', bubbleX)
                .attr('y', lineLayout(1))
                .style('font-size', fontSize * 0.8)
                .attr('class', 'c-name');

            // Draw the second line of the name if it exists
            if(nameParts.length > 1) {
                let name2 = svg.append('text')
                .text(nameParts[1])
                .attr('x', bubbleX)
                .attr('y', lineLayout(2))
                .style('font-size', fontSize * 0.8)
                .attr('class', 'c-name');
            }
        }
    }

    function drawScoreArc(bubbleX, bubbleY, bubbleRadius, score, direction, klass)
    {
        var arcLength = (Math.PI * score);

        arcLength = (direction == 'right') ? -arcLength : arcLength;

        let capArc = d3.arc()
            .innerRadius(0.85 * bubbleRadius)
            .outerRadius(bubbleRadius)
            .startAngle(Math.PI)
            .endAngle(Math.PI + arcLength);

        let capArcPath = svg.append('path')
            .attr('d', capArc())
            .attr('transform', `translate(${bubbleX} ${bubbleY})`)
            .attr('class', klass);
    }

    d3.csv('data.csv', row => {
        return {
            code: row.Code,
            name: row.Name,
            year: +row.Inception,
            category: row.Category,
            type: row.Type,
            cap: parseNumber(row['Market Cap']),
            vol: parseNumber(row['30 Day Trade Volume']),
            fork: row['Hard-Fork Of'],
            similar: row['Similar To']
        };
    }).then(data => {
        enrichData(data);
        drawGraphic(data);
    });


})(window.d3);