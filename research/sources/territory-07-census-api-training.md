Source: https://www2.census.gov/about/training-workshops/2026/2026-02-19-getting-started-with-census-api-transcript.pdf
Title: Getting Started with the Census API - Transcript
Fetched: 2026-11-06T05:56:45.406Z

# Getting Started with the Census API February 19, 2026

Welcome and thank you for standing by. Currently, all participants are in a listen only mode. Today's webinar is being recorded, and the recording will be posted publicly. If you have any objections, you may disconnect at this time. Now, I'd like to turn the call over to your host for today, Deb Rivera.

Great. Thank you so much, Lisa, and good afternoon, everyone. Welcome. Thank you so much for joining us for this webinar event. Getting started with the census Application Programing Interface or API. My name is Deb Rivera and I am going to be your host for today's event. So in today's webinar, our speaker will give a brief overview of what the Census Data API is.

Then focus on how to use it in practice through live demonstrations. So you will learn how to find available variables, edit existing URLs to create example API queries and download results. So today we have a wonderful panel of subject matter experts and they are here to help answer your questions. So as we are going through the presentation, we would like to encourage you all to use the Q&A panel in Webex to submit questions that you may have.

The question and answer panel is located all the way in the bottom right of your Webex screen. If you cannot see it, you may need to click on the three dots at the bottom right to pull it up. And then at the end of the webinar, we will go over some of the questions that were submitted through the Q&A panel.

A quick note on the question and answer session today, we will focus on the Census Application Programing interface or API. We will not be able to go in-depth to address questions on the topic of census data, the collection process, methodology, or other census products. Now, finally, we are recording the webinar today and all of these materials are going to be available through the Census Academy website.

Now, I'd like to welcome you all again, and thank you so much for joining us. It is my pleasure to introduce our speaker for today, Samuel Patton. Welcome, Sam.

Thank you so much, Deb, and thank you everybody again for joining our webinar on getting started with the census API. Again, my name is Sam Patten. I am going to be your presenter today. We have a lot to cover. So I'm going to go ahead and get us started. Here's a general overview of what we're going to cover in the webinar today.

We're going to start with some background and basics about the API and how the census Data API works. But the majority of our time today is going to be spent actually going into the API and pulling data through three different examples. Then we'll close out with a couple of resources, and we'll have time for a short Q&A at the end.

Starting with some background and basics on the API. If you weren't aware already, API does stand for Application Programing Interface, and the Census Bureau has three main APIs that we pull from. We have the Census Data API, our Geocoder API, and then our TIGERweb rest services, the Geocoder and TIGERweb services are more focused on mapping and geospatial products, and we're not going to be getting into those today.

However, if you do have questions related to those, I did include the Geocoder and TIGERweb team emails down at the bottom here. What we're focusing on today is strictly the Census Data API. So who actually uses

the API? And I wanted to include this because I think there's a lot of misconceptions when it comes to APIs, especially our API in general, because when people hear API, they often think you have to be an app developer or understand programing in order to use and access the API, and that's definitely not the case, because what we're going to be doing today is strictly accessing the API through our web browser.

So you do not need any kind of previous programing knowledge or anything like that. So if you're a student, a teacher or researcher or someone from a government agency or a developer as well, I'm hoping we're all able to benefit from the information presented in the webinar today. And for those of you who are interested in using the API through a programing language like R or Python, I do have some resources at the end of the presentation that can help you get started on that learning journey after the end of the webinar.

I also included here some important things that we've seen in the past for why people choose to use choose to use the API to access their data. And we're actually going to come back to the first one on this list here, but it's a really common one that perhaps you need older data that's not available on data.census.gov, such as something like pre 2010 ACS or American Community Survey data.

And we'll be looking directly at an example of that in just a bit. A lot of other popular reasons are perhaps you want to pull data from multiple tables at once, rather than looking at those tables one by one and picking out the individual variables. Or maybe you just need one single variable, or maybe you need a whole lot of variables.

There's a whole lot of different reasons for why you would choose to use the API. I'm going to show you a couple of those today when we get over to our exercises.

So if you do choose to use the API, you can get started over on our Developers Page. So on the Developers Page there's a lot of helpful information available. One of the first things you might see is a link that says Discovery Tool at the top there. This is going to take you to our main discovery tool page for the API.

That is going to list out all of the available datasets. We're not going to get into the discovery tool today, but this is a great place to look if you're searching for a specific dataset within the API, and you're not sure if it's there or not. Check out the discovery tool because it lists all of the datasets on one page.

You can also assign some helpful information through our Slack Channel. We have different courses for learning about the API guidance materials, and then you can also request an API key. So to briefly talk about an API key in all cases of accessing the API it's going to be completely free. However, if you do plan to run more than 500 API calls per IP address per day, then you will need a key.

So requesting a key also completely free. You can just click on the link on the developer's page or visit the link on the slide. Here you'll just input some information and you'll get the key sent directly to you. If you don't have a key though, and you're following along today, when I go through my examples, don't worry, you're still able to run API calls without a key.

However, I do encourage everybody to sign up for a key after the completion of the webinar just to make sure you don't run into any kind of rate limits or anything like that. And where we're going to be going to get started, to build out our different API calls, is over on our available APIs page. This page is really useful because you're able to go into and pick a single dataset that you're looking for, and then get example links and example URLs, variables and things like that related to your datasets.

So we'll spend a bit of time today looking directly at this available APIs page. How do we get there? How do we pick a dataset? How do we pick the year and how do we build out our API URLs? So speaking a bit more on how these API URLs are laid out. As I've mentioned a couple times already today, we are accessing the API strictly through our web browser, and that's going to be done through a URL like you see on the screen here.

And many of these API calls follow the same kind of pattern throughout the URL structure here. So I wanted to break down each part of that and kind of how it works, what you can change, what you need in there and what you can add. So the first part of these API calls always begin with api.census.gov/data. The next part after that is usually going to be a year.

So in this case whereas you can see looking at 2024 data. The only exception here that might not be a year. Sometimes you will have the word time series instead of a year if you're looking at a time series dataset. Then following the year you're going to tell the API what dataset you're looking for. A lot of cases, you can almost look at the URL and kind of read what's happening here.

In this case, you can see we're looking at ACS 5-Year subject tables. In this case it's not always that clear, but a lot of times you can almost read it directly from the URL.

Following the dataset you're going to have this get equals function. And this is where you're going to tell the API what variables you need. So right after the equal sign is where you input those variables. And in this case we have the name the variable. And then a comma always separates these variables. Whenever you're adding a new variable you separate them by a comma.

And then we have variable S0101 underscore C01 underscore 032E, which in this case is showing the median age in years. And then lastly we have our geography. In this case we're saying I want to see all counties in the state that has a state FIPS code FIPS code of 12. The reason I know that we're looking at all counties is by that small asterisk that you see there.

So that asterisk mark, you might also hear referred to as a wildcard in the API. So that asterisk or wildcard basically says to the API, okay, I want everything of what's before this. So in this case it's saying I want all counties there in the state that has a state FIPS code of 12. So you put all that together, you put it in your browser, you hit enter and it's going to return data in a Json format that's going to look something like this.

So this is the data that's output from that example URL that we have there. So you can see at the top row here we have name. We have that variable the state geography and then the county code. And then moving down we have the names of our counties in Florida. So you can see there the state that had a state FIPS code of 12 was Florida here.

So we're pulling all counties in Florida. And then right after that and I highlighted here to make it clear, we're looking at the median age in years for each county. So that's what's coming from that S0101 variable is the median age for each one of these counties in Florida.

All right. I hope that gives a kind of a general overview of how the API works and how these different URLs work. Now, I want to jump straight into looking at our actual API examples here. So I have three different parts of these. And we're covering kind of a different focus on each one of them. The first one I wanted to just keep simple and look at data for all counties in a state.

So the example question I was looking at here was, let's see if we can find the total population under five years old of all counties in Utah, using the most recent 2024 ACS 5-Year Estimates. And when I think of accessing data from the API, I like to break it down into a couple different parts here. So three main parts here we have a Variable a Geography and a Dataset.

The variable we're looking for here was the total population under five. The geography all counties in Utah. And then the dataset we're going to use is the 2024 ACS or American Community Survey 5-Year Estimates. So I'm going to head on over to my web browser and get started. And I'm going to remember actually, the first thing I want to remember from this is the dataset, the 2024 ACS 5-Year Estimates.

So I'm getting started here on the Developers Page. So first of all, how did I get here? I'm going to show you a couple different ways to get here. If you are just on the home page of census.gov and you see this data and maps dropdown, you should see a link there that says Developers. So that's one way to get there. Another way to get here and the way I get here most of the time is a really easy URL redirect.

You might remember how some of those API URLs started. And if you actually just type in api.census.gov into your browser and hit enter, that also redirects you back to the Developers page. Here. So when you're on this developer's page again, if you scroll down you can request a key, get additional guidance, join our Slack Channel.

We have video tutorials and things like that down towards the bottom as well. But what I'm going to focus on is actually towards the top here. Again, that available APIs link is where I want to get started accessing my data.

So I'll click on available APIs here. And then you can see we have the different datasets we can choose from. So if you scroll down you see we have a lot of different datasets available in the API. But this was the first part of my example that I was thinking about was what dataset I was using?

In this case, we were using the American community Survey. So here when I open up the ACS, I've got the 1- Year Data or the 3-Year or the 5-Year Data to choose from. I'm going to use the 5-Year Data because the 1- Year Data, as you can see here, is restricted to areas with populations of 65,000 or more.

We are looking at all counties in Utah. So some of the smaller counties in Utah might not hit the 65,000 population threshold. So I want to make sure I collect all data from all the counties. So I'm going to use the 5-Year Estimates here because they don't have the same 65,000 population restriction. So I will click on the 5-Year Data here.

And then each one of these available APIs pages all look a little bit different. So the ACS page here explains what the different table types are. As we scroll on down we can switch between years which we are going to do next. We can compare data, see information about variable changes. But if we keep on scrolling down we can choose from our different table types here.

So when we're looking at the total population under five, we can probably find that from a couple of different tables here. In this case I'm just going to get it from a subject table. I'm actually going to get it from table S0101. So I'm going to focus on the subject tables here. And when I see these links here, there's really two that I'm trying to get to for a lot of these different examples here.

And that's the variables link. So I can understand what variables or data points are available within this table here. And then the Examples link is going to help me understand how to build out an example URL. So the way that I find best to do this within my browser is just to work between a couple different tabs, and then we'll go back and forth between the tabs to build out our final, final API query.

So the first link I'm going to open here, I'm going to use the HTML link for variables. So what I'm doing on it, I'm just right clicking on HTML and choosing open link in new tab. And then I also want this example variables that I'm going to use to. So I'm going to open up examples in a new tab.

So once again right here we have our example excuse me our variables page. And then over here we have our examples URLs. So we're going to start with the examples because as you can see here this gives us the URL to start building out our API call. And we were looking at data for all counties in Utah. So I don't have to scroll down too far.

I can see the county level data is right here at geography level or summary level 050. And then we have three URLs to choose from on all of the URLs on this page. The only difference between them is the geography portion. So you can see kind of right here where it says ampersand four equals. This is the part that differs on each one of these.

I'm going to use this second URL here that I highlighted because you can see it's saying it's pulling all counties in all states noted by those two asterisks there. I wanted all counties in Utah, and I need to find the state FIPS code for Utah. So this is going to allow me to search through the list of states and counties and find the state FIPS code from Utah directly from this API call.

So what I'm going to do on this one is just click directly on it. You'll also notice the key portion at the end here. But when I click directly on this URL, notice now up in my address bar that key portion is deleted. So if you do have a key again this is not necessary right now. But if you have one it's ampersand key equals.

And then you would enter your key after the equal sign. But again we're okay to run it without this. So as I get to this page I'll zoom in a bit here you can see we're getting all counties in all states. So we're starting with Alabama. And then if we scroll down we'll have to scroll through all of the different states in the U.S.

I want to quickly find Utah and I want to find its state FIPS code. So I can see here Alabama has a state FIPS code of 01. But I'm looking for Utah. So what I like to do on these really large API calls is use the browser's built in search function just by for me, hitting control and F if you're on a mac, it might be command in F.

If you are using a different browser, this might open a different spot as well. But for me in Chrome control and F and that opens right up here. So from here I can just quickly type in Utah and it takes me right down to Utah. So I can see the data from Utah here. But I want to clean up this query a bit so I can see that the state FIPS code for Utah is 49.

And what I want to do with that 49 is just go up to the URL and replace just this asterisk with it. So if you're following along, be careful to not delete anything except for the asterisk. That's all replacing the asterisk with the number 49. So when I do that, every time I make a change to my API calls, I like to just hit enter, refresh the page and make sure it loads properly.

So make sure. So if I made a mistake I know where I made a mistake. So here and load it up. We're seeing all counties in Utah. It looks like it's working successfully here. Now I need to change this variable though,

because this is not giving me the total population under five. This is actually giving me the estimated total population.

So I want to go back over to my variables page here and find the variable for the total population under five.

So when we're looking at these variables pages here, they're separated into a couple columns here. And it might take a second to load. If you're following long again on this one. There's a lot of different subject table variables. So just give it a second. Maybe refresh the page if you're having some issues. We have the names of the variable.

And then the labels of the variable are the two things that I want to focus on right now. Because the name is what we're actually going to pull into the API URL and then get the data from that way. So they're sorted in alphabetical order. So it looks like we're mostly getting geography variables first. So I'm going to scroll on down until I start seeing some variables from some data tables here.

So we can see this is actually the variable that was included in the default call as S0101 underscore C01 underscore 001E is just giving us an estimated total population. So we wanted the estimated total population under five years. So it looks like right below that it's this variable that ends in 002E. That would give us the estimated total population.

So again I don't want to copy this here. This is just explaining basically what this variable means. So this is the variable I want to take. And then put in the URL so you can highlight and copy it and then take it back over to the URL here. And then I just want to click on this. So I just double clicked on this variable to highlight it again.

And then I'm just pasting that other variable over. So really all that changed there was really changing the one to a two. So that's another way you could edit the data there. So when again when I add this variable in, I like to hit enter and make sure it's working. And it looks like it did. Now we are seeing the estimated population for those under five years old for every county in Utah.

So there's a couple different things I wanted to talk about with the variables before we moved on to the next example here. So going back to the variables page here, you can see this is broken down into a couple different parts. Here we have S0101 underscore C01 underscore 002E. So what does each part of that mean.

Well S0101 is the table ID that this variable is being pulled from. And I think explaining the other two parts of this variable will make a little bit more sense if we take a quick detour over to data.census.gov. So what I'm going to do on data.census.gov is just search for all counties in Utah S0101. Since that was the table we were pulling from.

So once this loads up, we should just get a data table back for S0101. So I'll click on the first result here. I'll minimize these to get a better view. And it does look like it defaulted me to the 2023 estimates. I want to make sure I'm looking at the same 2024 5-Year Estimate. So I'm going to switch the dataset to that really quick.

So on this page and I'm just going to type up here for reference. The variable we were using S0101 C01 002E. So the C01 here is actually referring to this as column one. So it's coming from the total column here. And

then the 002 if you actually count out one two that's where the two comes from. And then the E is just an estimate.

So this would be C01 underscore 003E 004E 005E etc. as we go down the list here. So if we wanted to include something like the percent this would be S0101 underscore C02 underscore 002E. And to confirm that we can go back to the variables list here.

We'll just have to keep on scrolling down a bit on the variables list until we get to estimated percent for the population under five. And I could see it. Here's S0101 underscore C02 underscore 002E. And if we wanted to put that over in our API call, we would just go back to the URL we were building out. We could click in right after the variable we added in, add a comma.

And then paste in that variable. Hit enter. And now we also have not just the estimated number but the estimated percent as well. And if we wanted to double check it against data.census.gov in Beaver County, we had 496 and 6.8% back on data.census.gov 496 and 6.8%. We're getting the exact same data there.

So you can edit these URLs as needed. Like you see here. So that's going to be it for this first example here.

In the next example I wanted to look at something that you couldn't find on data.census.gov because I was just showing you some data kind of comparing between data.census.gov and the API. And for a lot of people, a lot of times it's just easier to go get that data from data.census.gov rather than using the API itself.

But there are some cases where you're actually going to have to use the API to get your data. And a really popular example of that is perhaps you need older data available, not on data.census.gov such as pre 2010 ACS data. So we talked about this earlier, but I wanted to come back to it and give an actual example of it.

So let's say you're on data.census.gov here I was looking at table DP05, data profile five from the 2024 ACS 1-Year Estimates. I opened up the dropdown menu and I wanted to scroll down and see how far back I could go in years. And it looks like I could only go back to the year 2010. That's because on data.census.gov, the furthest back you can go for the 1-Year and 5-Year Estimates is on the 2010 to the most present 2024 release.

However, you can see on the API, I was able to go all the way back to the year 2005 for the 1-Year Estimates. So on the API, the 1-Year Estimates go back to the year 2005, and the 5-Year Estimates go back to the year

2009. So when you're looking at trying to access some of these older datasets and trying to pull an entire table, like, let's say you're trying to pull the entirety of table DP05, we added some new API features over the last year or two that really make downloading this data a whole lot easier. So the two features that we added were output format and descriptive equals true. So output format you can either add equals CSV or equals Json to output the data in your preferred format here. So CSV is going to download the data for you as a CSV file. And then you can open it in something like of course Excel or a different something like Google Sheets or something like that. And then descriptive equals true provides the variable label that matches to that variable name. So this is extremely helpful when you're getting data from an entire table. Because without this descriptive equals true function here. When you're looking down at this file that I downloaded the row to here, this is all

coming in from that descriptive equals true function. So without that I would not know the matching variable label to the variable name.

So I'll show you an example of that. Right now when we're looking at pulling some of this early American Community Survey data. So the example that I chose here was just downloading a data profile table for all states in the U.S. using the ACS 1-Year Estimates. So I wanted to break this down here looking at each part again, this time rather than a variable, we are looking at a group call because we wanted to pull every single variable from table DP05.

So we're going to use this group functionality to pull in table DP05. Our geography is going to be all states in the U.S. And then our dataset, we're going to use the 2009 ACS 1-Year Estimates.

So I'm going to go back to my browser here and get started on this one. I'm going to close out my old tabs, and I'm just going to start fresh back on the Developers Page. So again to get there you can do API.census.gov. And that will take you right back to the Developers Page.

From here I was going to go on over to the available APIs. Once again, we were using the ACS or American Community Survey. And this time I was sticking with the 1-Year Estimates. So I'll click on the first link here.

From here, as we scroll on down a bit about halfway through the page, we see the years we can choose from, and if you click on more, you can go all the way back to 2005 on the API here. For me, I was just going to go back one year that I couldn't find on data.census.gov so I could get 2010 on data.census.gov, but I could not get 2009.

So I'm going to just go back one year to 2009. And then from here we were looking at a data profile table. So we've got our data profiles here. And this time what I'm going to open is just the last link here. Examples and supported geographies. We're not even going to actually need to open our variables list.

Most likely on this one because we're going to use that descriptive equals true function that really does that work for us. So we'll open up the examples and supported geography in a new tab. And we'll get to a page that looks like this. So this is our main kind of discovery tool page for in this case the 2009 ACS 1-Year Estimates Data Profile Tables.

So whether you're looking at this page or you're looking at an economic census page or you're looking at county business patterns, they all will look the same like this. And you'll have these different links to choose from. And for me, most of the time when I'm doing my API calls, I'm looking for the examples links here to help me build out those example URLs.

So that's when I'm going to click on here is just opening up the examples list. Once again, we are looking at our list here. So on this one the geography we were going to use is just the state geography.

And we can see here we have two URLs to choose from. And again the only difference here is the geography portion here. So this one has a state colon asterisk or wildcard. This one has a state colon 01. So again if I want all states in the U.S., I want to use this first link here with the asterisk that will pull back all of the states in the U.S.

So first thing I'll do is just click directly on this query, or you can open it up in a new tab, and it's going to run this default call for me. So it looks like the geography is pretty much sorted here. We've got all states in the

U.S. including Puerto Rico, and I believe DC comes in on here as well. So really the only thing we have to change is the variables we're looking for. So to pull all of table DP05 what I can do is just highlight and delete these two variables here. So name comma 02 underscore 001E. We can just get rid of that. And then right after the equal sign typing group open parentheses DP05 right close parentheses. So when I do that again just to make sure everything's running I can hit enter. And you can see here now we're looking at every single variable from table DP05 for all the states in the U.S. So it's a lot to kind of look through and try to parse through within your web browser here. So what we're going to do to make it a lot easier is just output it as a CSV file and take a look at it in Excel. So what I'm going to do now is at the end of the URL, add an ampersand output capital F format equals CSV, and that capital F is important these API calls are case sensitive. The other thing I'm going to add in, and this one technically optional, but I highly recommend using these two together, is ampersand descriptive equals true. That's going to tell me what all of these variables you see on my screen here, what their matching labels are. So when I add those two together and I hit enter. For me it's going to load up my file browser here. That's just because I'm using a guest mode in Google Chrome here. If you're following along and you input that information into your own Chrome browser or anything like that, it probably automatically download it for you. But if you get a file browser like this, you can just name the file whatever you'd like and click save. And then we can open up that file and take a look at it. So when we get here in Excel there's still a lot of information. And there's a couple things that I like to do just to make the data a little bit more easily readable. First of all is of course just kind of clicking and expanding out all of the cells here. And then what I also like to do is wrap the text. So I'm just highlighting all the text here across row two. And then there's a wrap text feature here. And then maybe make it a little bit smaller for some of those larger variables. So again the descriptive equals true function is so helpful here because this entire row here was brought in by descriptive equals true in the URL. If I didn't include descriptive equals true I'm going to delete this really quick. This is what the final output would look like. And I would have no idea what DP05 underscore 001E is. I'd have to go back to the variables list look it up that way. So that's why I definitely recommend using descriptive equals true to bring this in. The other thing you might think is missing here is the geographies. And they're not missing but they're just output. If I scroll on over to the far right side of the file here, for me it's in column XZ. So what I like to do is just move that on over to column A. So highlighting everything in XZ here, and then you can copy it or you can cut it. And then we can scroll back over to column A, right click on column A and choose Insert Cut Cells. And then we have those geographies here. A couple other things these are kind of more just Excel tips to make the

data a little bit easier to read. This one's an entirely personal preference. Sometimes I like to replace these exclamation points just to make the data or the labels rather a little bit easier to read.

So I'm opening up control and F this find and replace feature in Excel, and then replacing those asterisks with maybe a space dash space and then hitting replace all. And for me, again, totally personal preference. I just find that a little bit easier to read through these different variables here. And then another thing I like to do is go into View Freeze Panes and freeze the first column here.

So now as I scroll across all of my data here, the geographies are locked in column A, and I can see what's going on with all of the data as it pertains to each geography. So as we're looking through this, you can also of course add in different data filters here. So if we're looking for or maybe something like looking back at the percent under five population, which was an example we looked at earlier right, but we were looking at 2024 data and now we're looking at 2009 data.

So you could also maybe add some filters. So I just highlighted row two here. Added a filter across. And we could sort this from largest to smallest. And if you're wondering why I picked Utah for that last example, it was actually that in 2024, it was the highest percentage state that had the highest percentage of those under five. And it looks like it was the same case back here in 2009 as well.

So are you able to sort data like that. You can always sort it back A to Z by the geographies as well. Or if you don't like how the data is output here. Another thing that I've seen people do as well is actually transpose the data entirely.

So what you could do is just highlight everything I just did control and A there and then copied it. And then going over to a new sheet here, I would right click and transpose the data. And the advantage of this is that it makes the data look a little bit more like you would see on something like data.census.gov, where now the geographies are output across the columns here rather than across the rows.

So you do have to be kind of cautious. This is actually now showing the variable labels no longer showing geographies there. But from here another advantage of this is you could add a filter to this as well. And you could filter out things like the annotation and columns. So we could go into the annotations here. Search for annotation and then select Add Current Selection to filter.

And then what that does is now it just leaves us with the numbers margins of error and then percents as well. So that filters out those annotations there. So there's of course a lot of freedom in how you access this data when you get it over to something like Excel. A lot of it comes down to personal preference, but I just wanted to share a couple of tips that I find helpful when downloading some of these older ACS tables.

So the last example I wanted to go over was accessing some earlier economic census data. So kind of sticking with the idea of accessing data that we could not get from data.census.gov. And the example I wanted to use here was how many drive-in movie theaters there were in the United States, using the 2007 Economic Census.

So again, what I did here is just take a screenshot of the filter panel on data.census.gov. And if you notice there is no 2007 data available on data.census.gov, but we can access this data from the API.

So breaking down each part of this again we have a variable we're looking for. I left it a little ambiguous here. Just saying how many was our variable. How many drive-in movie theaters or really what we're looking for

and what we're going to use there is the number of establishments, the geography. We're going to keep it simple and just look at the entire United States.

And then our dataset was the 2007 Economic Census. There's one other piece of this, though, that we're going to need for Economic Census Data. And that's we're going to need the NAICS code, NAICS code or North American Industry Classification System Code. So I'm going to show you how to find that directly within the API and we'll get started on this example right now.

So back on my browser here. We could of course we could go back to the available APIs page and get started with the 2007 Economic Census Data that way. I want to show you another way to kind of get around the API that you have kind of in your tool belt. So if you can kind of remember the syntax of how these API calls began, they begin with api.census.gov/data/ a year.

So if we just put 2007 in and in this case if we just hit enter like this, it's still loads. But it's outputting the data like you see here in a Json format. So if you ever get to a page like this and you want to output it in a more kind of user interface format, what we call the discovery tool, just add a dot HTML to the end of it.

So api.census.gov/data/2007.html. We hit enter. What this does is now we're looking at every dataset in the API that's available for the year 2007. So we can see we have American Community Survey data. If we scroll on down a lot of ACS data here, we see things like the County Business Patterns.

And there's not too many datasets that were available in 2007 here. But if we want to search through them again, use that control and F feature that we used earlier and search for maybe Economic Census. And then that will take us directly down to the Economic Census Data for 2007 like you see here.

And like we talked about earlier, really the two links that I'm focusing on are examples and variables. So I'm going to open those up in two separate tabs. We've got our examples link here. And then since variables is the only other link I need, I'll just open it in this tab here. So once again variables ready to go on this tab, examples in this tab.

We were going to use the United States as a geography. We have two URLs to choose from. One has this

U.S. colon asterisk and at the other a U.S. colon 00. These are both going to output the same thing. So it doesn't really matter which one you choose here. So I'll just click on the first link. And once we get here I'll zoom in a bit so you can see the data. What this is showing is basically the number of employees in Accommodation and food services in 2007 was 11,600,751. We want to change this to the number of establishments for drive-in movie theaters. So to do that, first I'm going to find the variable for establishments. So going back to my variables list here, here's that EMP variable that it gave me by default. It's saying that that was number of employees number of establishments. It looks like it's ESTAB in all caps. Here again it is case sensitive. So if I just go back to my URL I could change out EMP with ESTAB again making sure I have those commas separating everything there and then hitting enter. Now it looks like this is giving me a number of establishments in Accommodation and food services. So now we need to find the NAICS code for drive-in movie theaters. There's a lot of different ways to do this. We have a site census.gov/NAICS that could help you out with this, but since we're in the API, we can also get these NAICS codes directly from the API.

So to do that, what I'm going to do is replace the number 72 and the NAICS code 72. Here with an asterisk with a wildcard. Because these asterisks don't just work for geographies, they also work for other variables like NAICS codes here. So when I add that in and I hit enter now we're pulling every single NAICS code from 2007 for the entire United States.

So you can see they're in numerical order here. So starting with NAICS code 21, 211, 2111, etc., etc., we need to search through this list and find drive-ins. So once again we are going to use that handy control and F feature to search for it's actually drive-in that we're looking for. And there's going to be two results that come up here.

It looks like the first one is movie theaters except drive-ins that's now what we want. We want the actual drive-in movie theaters. So I can actually see the answer I was looking for right here. It was 254 that was the number of establishments for drive-ins in 2007. But if we want to clean up the page here a little bit, this is the NAICS code that we were looking for.

It's a 6-digit NAICS code 512132. We can take that NAICS code and instead of our asterisk up here we could put 512132 hit enter. And now we have just that single line of data. And again we can see the number of drive-ins in 2007 was 254. One last thing I did want to show you with this query is a couple other cool things you can do with that wildcard function is you can also maybe instead of seeing just a 6-digit NAICS code, we could say, I want to see all NAICS codes that begin with 5121.

So you would say 5121 asterisk like I did there. I hit enter and now I see it's showing 5121, 51211, 512110. Even taking it further than that, all to all NAICS codes that begin with 51, we could do that as well. So you can see this is that information NAICS code here. So all of these different information categories, information, entertainment things like that.

So a lot of cool things you can do with the NAICS codes there. And of course if you ever make a mistake or anything like that in the API, you can just hit the back button to start going back to where you were before with just a single line of data that we are looking at. So taking that example of movie theaters in the U.S., what I did was actually kind of graph out what the decline looked like over the last 20 or so years.

So the reason that I wanted to show this to was not just to kind of show this graphic here, but I wanted to drive home the point of where I got this data from, because from 2012 to 2022, I was able to get this data on data.census.gov or the API. But from 97 to 2007, I didn't need to go to the API to get that earlier data, so I wasn't able to get a full picture of kind of what this decline looked like here, without also having that knowledge and being able to go to the API.

And you might also be looking at this and thinking, you know, 1997 was a long time ago, but not that quite long ago. So what if we wanted to go back even further and you can go back even further if you're using a different dataset. So in this case, I went and I looked at the County Business Patterns.

And this is one of the oldest non time series datasets that you can access on the API. You can see I was able to go all the way back to 1986 with the County Business Patterns data, and then again kind of highlighting where this data came from on data.census.gov. I could only go back to 2012, but on the API, I was able to go all the way back to 1986.

And you can see there was almost 1300 drive-ins all the way back in 1986.

All right. That is going to be all I had for you all today, in terms of our examples. I wanted to close out with just a couple different resources, and then we'll have time for a couple of questions. Firstly, if you would like to have some additional training materials, I included our API resources page here as well as our feedback email.

If you have a question that you know you can't figure out on your own and you need some help, just email us at census.data@census.gov. Or more than happy to help you out with those kind of individual questions.

If you'd like some more in-depth trainings, we have some of our most in-depth offerings are these workshops that we offer. These are 2 to 3 hour long hands on trainings where we look at accessing data through not just data.census.gov but also MDAT our Microdata Access Tool. And then we also have some additional trainings related to the API.

And as promised for our programmers, I did want to include some links for some trainings related to R and Python. So the first slide I have here you can see these are all census.gov links. These are trainings offered by us here that are referencing open source software or accessing data through an R package like tidycensus, or if you want to get some additional help, we have a lot of really smart people in our Slack Channel who are also extremely helpful.

You can always post there if you need some additional information and some help with your programing related questions. And two of the most popular packages I see used for R and Python is tidycensus, which is an R package created by Kyle Walker and then censusdis which is a Python package created by Darren Vengroff.

So I included links from Kyle and Darren on the slides here. If you want to get started with learning tidycensus, there's a lot of helpful information there. And if you want to get started with learning Python, there's some information out at the bottom. And just to reiterate though, these are a third-party packages these aren't created or maintained by us here at the Census Bureau.

We do our best to help out as much as we can, but we're not really able to answer any specific questions related to them.

And lastly, I wanted to mention, if you'd like to help us improve data.census.gov, we would really appreciate signing up for our Usability Testing. We are looking for both new users to data.census.gov as well as more experienced users. So if you're interested in helping us, as well as helping the public get better access to census data, please send us an email and we'll be more than happy then to schedule a session with you all.

And at this point, I am going to turn things back over to our host, Deb, to talk about our evaluation and open things up for questions.

Yeah, great. Thank you so much, Sam. All right. I'm here. And in just a few moments, we are going to begin our question and answer session. But before we dive into your questions, we wanted to ask you to fill out an evaluation survey. This is going to pop up on your screen when you exit the Webex. So we ask that you please don't close that screen.

Take a moment to fill it out and tell us your thoughts about today's webinar, what you think worked, or if you have additional topics that you would like to see us cover in the future. And now, if you do have any

questions after our session concludes, or if you would simply like to submit your questions to us in writing, please feel free to reach out to any of the email addresses that are listed here on the screen. If you are a member of the public, please reach out to the Center for Enterprise Dissemination, and for members of the media, you can contact the Public Information Office at <u>pio@census.gov</u>. All right. So with that, it looks like we can go ahead and transition to questions that we have received.

And, Sam, we had a number of very thoughtful questions submitted through the Q&A panel. So I would like to thank all of you for your enthusiasm and participation. But just as a reminder, we will be focusing on the census API platform today. But with that, Sam, if you are ready, we can begin with our first question.

And our first question reads, is there a way to pull data for multiple years?

Hey, thank you for that question. That's a good question. And the answer is it kind of depends. I'll say most of the time, no. So for something like this, the 2007 Economic Census, unfortunately you can't come in and say 2007 comma 2002 like you can with variables. That doesn't work. You have to pull one at a time.

You have to go back to 2002, I believe it's EWKS and kind of rebuild the query that way. So you would have to do that for 2002, 97 and things like that. The only exception to this is if you see the word time series here. So these are going to be a list of time series datasets.

And with them being time series, you can pull data from multiple periods of time at once, whether it's months or years or quarters or things like that. So if you're in a time series dataset, yes, you can pull multiple dates and times at once. But if you see a year in the URL, like something like the American Community Survey, unfortunately you do have to pull that data one by one, year by year.

And that's because the variables can sometimes change from one year to the next day.

Wonderful. Thank you. Sam. Our next question reads, is it possible to get an API key for an organization email?

Yeah, you can sign up for key for your organization. I would say just send us an email to confirm that there won't be any issues like that. There shouldn't be. But if you want to just send us an email at census.data@census.gov, we can double check that confirmation for you.

All right. Thank you Sam. Our next question reads on a group download can you limit the CSV from downloading or getting the annotation and the margin of error columns if not needed?

So if you're using the group functionality, no, you would not be able to. The only way I can kind of think of around that, if I go back to, let's say maybe, 2009 profile, Paul oops, not.com. Excuse me, dot HTML. So if we're going back into an example call here. If you're doing the group functionality like this group DP05, that's, that's pulling every single thing from the table.

It's pulling the margins of error. It's pulling the annotations, it's pulling the estimates, the percent estimates. If you want individual variables, you have to do them one at a time. So you would have to say, okay, I want this variable. I want this next variable. You would have to go one by one by one. The downside of this is obviously it takes a little bit more effort.

And two, you are limited to actually 50 variables within the call. And as you can see here, there's definitely more than 50 showing up in this data profile table. But your only options are either to one, kind of do it one by one like I'm doing here, or two either filter, just filter them out in Excel would be your other option.

Right. Thank you so much, Sam, and thanks for your question. And now finally, Sam, someone asked, if you could share the text, that they have to add to the download the data. I thought this might be a good opportunity, where you can show participants where this information lives in the developer site.

Yeah. So there's some helpful information on the Developers Page here. So again, back on the Developers Page api.census.gov is a quick way to get there. And if we go into the Guidance for Developers option and we go into the User Guide here.

Once this loads up there's a lot of helpful information within this user guide here. So you can see things like Core Concepts here. You can see how to pull these different variables, things like that. And I'm not sure actually exactly where the output format option is in here. Oh here it is actually right here towards the end where it says the Response Formats JSON and CSV.

You can see it’s ampersand output format equals CSV. So I will also type that in the chat. So I add that one. And then I highly recommend also adding descriptive equals true. So those were the two options that I added. You can kind of combine them together. Descriptive equals true really I add that in when I'm doing a call like this that has a lot of different variables available.

So I know what all of these different variables mean. But output format equals CSV is the main one there.

Thank you so much, Sam. And thank you all for the great questions that you have submitted. We did receive an overwhelming amount, so thank you all so much for submitting those. If we did not answer your question today, please feel free to reach out to us at census.data@census.gov. We do have a wonderful team of experts that are just, you know, waiting to answer your questions.

So please feel free to reach out to us. And unfortunately that is all the time we have for the Q&A today. Thank you again for all of the questions and your feedback. So, Sam, I will throw things back over to you and you can give us your closing remarks. Thank you.

Yeah. Thank you so much, Deb. And my apologies that we weren't able to answer everybody's questions. Again, just to reiterate what Deb was saying, please do send us an email at census.data@census.gov. I promise you we will get back to you with your question. So lastly, just wanted to give a quick shout out to our Data Dissemination Specialists.

These are a team of Census Bureau employees who offer customized data trainings for different individuals and organizations. So if you want to receive a customized training from one of our Data Dissemination Specialists, you can reach out to them at the email or contact them at the phone number that you see at the bottom right of the slide here.

But that was all we had for you all today, so I really do appreciate you all joining. It was my pleasure to present this information to you. I hope you were able to learn something new about the API that you can use in your day to day life. And again, if you have any questions, please do send us an email.

That's all I had for you all today. So thank you all so much and I will see you next time.
