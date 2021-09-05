#!/usr/bin/env node

const puppeteer = require("puppeteer");
const fs  = require("fs");
const csvParser = require("csv-parser");
const { title } = require("process");
const stringSimilarity = require("string-similarity");
const createcsvWriter = require("csv-writer").createObjectCsvWriter
const { count } = require("console");
const yargs = require("yargs");
var log4js = require('log4js');

//adjustments to save the program's run results to the log file
log4js.configure({
  appenders: {
  out:{ type: 'console' },
  app:{ type: 'file', filename: 'logs/program.log' }
  },
  categories: {
  default: { appenders: [ 'out', 'app' ], level: 'debug' }
  }

});
//logger created
var logger = log4js.getLogger();
//logger.debug will be used as a writer to the log file
logger.debug = logger.info.bind(logger)

//for memory leak 
process.setMaxListeners(0);

// Get starting and ending value from console
const options = yargs
 .usage("Usage: -s <start> -e <end>")
 .option("s", { alias: "start", describe: "Starting values", type: "string", demandOption: true })
 .option("e", { alias: "end", describe: "Ending values", type: "string", demandOption: true })
 .argv;

 //get csv file from console
var filePath = process.argv[2];
//filePath = "books.csv"
var dataCount = 0;

// read dataa from csv file
function getData(filePath) {
  let data = []
  return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
          .pipe(csvParser({ separator: ';' }))
          .on('data', (csvrow) => {
            dataCount += 1
            // create book object from every row
            const book = {
              authors : csvrow.authors,
              title : csvrow.title,
              price: csvrow.price,
              isbn13: csvrow.isbn13
            }
            data.push(book)
          })
          .on('end', () => {
              resolve(data);          
          });
  });
}


//csv writer created for writing csv file
const csvWriter = createcsvWriter({
  fieldDelimiter:";",
  path:filePath,
  //creating csv file header
  header: [
    {id:"authors", title: "authors"},
    {id:"title", title: "title"},
    {id:"price", title: "price"},
    {id:"isbn13", title: "isbn13"}
  ]
});
const rowCount = options.end-options.start;
async function ScanandFind() {
  counter = 0
  counter2 = 0
  try { 
      //create data variable for keep data from csv file
      const data = await getData(filePath);
      // to keep not founded ISBN 
      const notFoundISBN = [];
      for (const book of data){
        counter = counter + 1;
        // for start from starting value and end in ending value
        if(counter >= options.start && counter <= options.end){
          counter2 = counter2 + 1;
          console.log(""+ (counter2*100 / rowCount).toFixed(2)+ "%");
          // first search ISBN book hasn't a name
          if(book.isbn13 != "" && book.title == ""){
            try{
              message1 = ""
              //The url is created to search for the isbn number in google
              const url = "https://www.google.com.tr/search?hl=tr&tbo=p&tbm=bks&q=isbn:"+ book.isbn13 +"&num=10"
              //browser is started to search
              const browser = await puppeteer.launch();
              //page variable is created to navigate to the page
              const page = await browser.newPage();
              // to go to page
              await page.goto(url)
              
              // get the xpath of element which the name of the book was written
              const  [ elementTitle ]  = await page.$x('//*[@id="rso"]/div/div[2]/a/h3');
              // get elemnentTitle text content
              const textTitle = await elementTitle.getProperty("textContent");
              // get textTitle Value
              const textValueTitle= await textTitle.jsonValue();
              
              book.title = textValueTitle
              console.log(book.title)
              message1 ="Book Names: " + book.title + "from isbn13: " + book.isbn13 + ""
              logger.debug(message1);
            }
            catch(error){
              // if ISBN is not found in the url, it was pushed in array
              logger.debug("Error searching ISBN")
              continue
            }
          }
          //after fill the name blank according to ISBN number, searched by the name of the books with the name
          if(book.title != ""){
            try{
              message2 = "";
              // first book name get url format with fill the blank wiht %20
              const title = (book.title).replace(/\s/g,"%20")
              // first it is search in D&R page 
              const url = "https://www.dr.com.tr/search/?Q="+ title +"&ShowNotForSale=True"
              //browser is started to search
              const browser = await puppeteer.launch();
              //page variable is created to navigate to the page
              const page = await browser.newPage();
              // to go to page
              await page.goto(url)

              // get book name from the element name of the book was written
              const  [ elementTitle ]  = await page.$x('//*[@id="facetProducts"]/ul/li[1]/div/div/div[2]/div[1]/a');
              const textTitle = await elementTitle.getProperty("textContent");
              const textValueTitle = await textTitle.jsonValue();
              
              // get book url from the element  where book url was written
              const urlTitle = await elementTitle.getProperty("href");
              const urlValueTitle = await urlTitle.jsonValue();

              // calculate book name and book name from D&R site
              var similarity = stringSimilarity.compareTwoStrings(book.title, textValueTitle);
              
              // I decided on the number 0.3 by trial and error. 
              //The reason for this is that Turkish characters are not used in some of the Turkish books in the csv file. 
              //However, there are Turkish characters in their names on the page.
              if(similarity > 0.3){
                //if book author cell blank fill it with textValueAuthor
                if(book.authors == ""){
                  // get book author from the element where book author was written
                  const  [ elementAuthor ]  = await page.$x('//*[@id="facetProducts"]/ul/li[1]/div/div/div[2]/div[1]/div[1]/div/a');
                  const textAuthor = await elementAuthor.getProperty("textContent");
                  const textValueAuthor = await textAuthor.jsonValue();

                  book.authors = textValueAuthor
                  message2 += "Author Name: " + textValueAuthor;
                }               
                //if book price cell blank fill it with textValuePrice
                if(book.price == ""){
                  // get book author from the element where book author was written
                  const [elementPrice] = await page.$x('//*[@id="facetProducts"]/ul/li[1]/div/div/div[2]/div[1]/div[2]/div[2]/div[2]');
                  const textPrice = await elementPrice.getProperty("textContent");
                  const textValuePrice = await textPrice.jsonValue();
                  
                  book.price = textValuePrice.trim()
                  message2 += "Book Price: " + textValuePrice.trim()
                }
                // for filling the ISBN cell a new page enter the urlValueTitle
                const page2 = await browser.newPage();
                await page2.goto(urlValueTitle);
  
                // I defined an array because the isbn number changes from book to book.
                const array = ["1","2","3","4","5","6","7","8","9","10"]
                let textValueISBN = ""
                  //if book isbn cell blank fill it with textValueISBN
                  if(book.isbn13 == ""){
                    for (const i of array){
                      // get "Barkod" from the element where "Barkod" was written
                      const [elementBarkod] = await page2.$x('//*[@id="catPageContent"]/main/div[3]/div[2]/div[2]/div/div[2]/div/ul/li['+i+']/strong');
                      const textBarkod = await elementBarkod.getProperty("textContent");
                      const textValueBarkod = await textBarkod.jsonValue();
                      var similarity2 = stringSimilarity.compareTwoStrings(textValueBarkod, "Barkod");
                      //if "Barkod" is match with text ValueBarkod, the number of isbn is also in this order
                      if (similarity2 > 0.9){
                        // get book isbn from the element where book isbn was written
                        const [elementISBN] = await page2.$x('//*[@id="catPageContent"]/main/div[3]/div[2]/div[2]/div/div[2]/div/ul/li['+i+']/span');
                        const textISBN = await elementISBN.getProperty("textContent");
                        textValueISBN = await textISBN.jsonValue();
                        book.isbn13 = textValueISBN;
                        message2 += "ISBN13: "+ textValueISBN;
                        break
                      }
                      else{
                        continue
                      }
                  }
                }
                message2 += " founded from Book Name: "+ book.title;
                logger.debug(message2);
                browser.close();
              }
              // If the book is not found in D&R, the same operations are repeated by looking at the Kitapyurdu.
              else{
                try{
                  message3 = ""
                  const url = "https://m.kitapyurdu.com/index.php?route=products/search&filter_name="+book.title
                  const browser = await puppeteer.launch();
                  const page3 = await browser.newPage();
                  await page3.goto(url)
                  

                  const  [ elementky ]  = await page3.$x('//*[@id="product-list-view"]/li[1]/a');
                  const urlky = await elementky.getProperty("href");
                  const urlValueky = await urlky.jsonValue();
                  
                  const [elementTitleky] = await page3.$x('//*[@id="product-list-view"]/li[1]/a/div/h2');
                  const textTitleky = await elementTitleky.getProperty("textContent");
                  const textValueTitleky= await textTitleky.jsonValue();
                  var similarity3 = stringSimilarity.compareTwoStrings(book.title, textValueTitleky);
                  if(similarity3 > 0.3){
                    if(book.authors == ""){
                      const [elementAuthorky] = await page3.$x('//*[@id="product-list-view"]/li[1]/a/div/p[1]');
                      const textAuthorky = await elementAuthorky.getProperty("textContent");
                      const textValueAuthorky = await textAuthorky.jsonValue(); 
                      book.authors = textValueAuthorky
                      message3 += "Author: "+ textValueAuthorky
                    }
                    if(book.price == ""){
                      const [elementPriceky] = await page3.$x('//*[@id="product-list-view"]/li[1]/a/div/p[2]');
                      const textPriceky = await elementPriceky.getProperty("textContent");
                      const textValuePriceky = await textPriceky.jsonValue(); 
                      book.price = textValuePriceky
                      message3 += "Price: "+ textValuePriceky
                    }

                    if(book.isbn13 == ""){
                      const page4 = await browser.newPage();
                      await page4.goto(urlValueky)
                    
                      const [elementISBNky] = await page4.$x('//*[@id="attributes"]/div/div[4]');
                      const textISBNky = await elementISBNky.getProperty("textContent");
                      const textValueISBNky = await textISBNky.jsonValue();
                      book.isbn13 = textValueISBNky
                      message3 += "ISBN: "+ textValueISBNky
                    }
                    message3 += "founded from Book Name: "+ book.title
                    logger.debug(message3);
                  }
                }
                catch(error){
                  message2 = "Error searching Book Name" + book.title
                  logger.debug(message2)
                }
              }
            }
            catch (error){
              message1 = "Error searching Book Name" + book.title
              logger.debug(message1)
            } 
          }
        }
        else{
          console.log("Aralikta değil")
        }
      }

      //after data prepared it is written to csv file
      csvWriter.writeRecords(data)    
      .then(() => {
        logger.debug("...Done")
      });
    }
    catch (error) {
      logger.debug("Could not write to file")
  }
}

ScanandFind();
