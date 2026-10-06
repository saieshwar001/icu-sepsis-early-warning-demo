# ICU Early-Warning Model Explorer

An educational browser-only demonstration of a logistic-regression baseline trained with the PhysioNet/Computing in Cardiology Challenge 2019 dataset.

## Try it

Open the published GitHub Pages site. Select **Load synthetic demo data** to explore the interface without using a patient file. You can also choose one `.psv` patient file from the PhysioNet Challenge dataset.

When a file is selected, JavaScript reads and scores it in the browser. The patient file is not sent to this website or stored by a backend. The static model parameters are in `model.json`.

## Safety and limitations

This is a student research prototype, not a medical device. A model score is not a diagnosis or an estimate of clinical risk. Never use it for patient care or treatment decisions. It has not been clinically validated.

The underlying dataset and its description are available from [PhysioNet Challenge 2019](https://physionet.org/content/challenge-2019/1.0.0/). No patient records are included in this deployment repository.
